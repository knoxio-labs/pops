// @vitest-environment node
import { expect, it } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { createTestUploadJournal } from '../documents/durable-upload-test-utils';
import { createClient as createTripsClient } from '../trips-api/client';
import { performCaptureRequest } from './api';
import { CaptureBrowserSession } from './browser-session';
import { captureResult, captureSource, deferred, sourceCapture } from './test-utils';

import type { DurableUploadInput, DurableUploadRecord } from '../documents/durable-upload-api';
import type { CaptureRequest } from './types';

async function fixture(late = false, loseCaptureResponse = false) {
  const persistence = createTestUploadJournal({
    tripId: 1,
    tripsOrigin: 'https://owner-a.test/trips-api',
  });
  const input: DurableUploadInput = {
    operationId: crypto.randomUUID(),
    fileName: 'booking.pdf',
    mimeType: 'application/pdf',
    byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
  const accepted: DurableUploadRecord = {
    input,
    ownerMatches: true,
    state: 'accepted',
    contentAvailable: true,
    taskId: 'task-A',
    documentId: null,
    reason: null,
  };
  const acknowledgement = deferred<Response>();
  const documentsClient = createDocumentsClient({
    baseUrl: 'https://owner-a.test/documents-api',
    fetch: async () => (late ? acknowledgement.promise : Response.json({ data: accepted })),
  });
  const requests: Request[] = [];
  let sent: CaptureRequest | null = null;
  const client = createTripsClient({
    baseUrl: 'https://owner-a.test/trips-api',
    fetch: async (resource, init) => {
      requests.push(new Request(resource, init));
      if (loseCaptureResponse) throw new Error('The owner response was lost after dispatch.');
      const request = sent;
      if (request === null || request.command.kind !== 'capture.create')
        throw new Error('Unexpected Trips command.');
      return Response.json(
        captureResult(
          request,
          captureSource([
            sourceCapture({
              attachments: request.command.input.attachments ?? [],
              originalText: request.command.input.originalText,
            }),
          ])
        )
      );
    },
  });
  const identity = { tripId: 1, client };
  const session = new CaptureBrowserSession(captureSource(), 1, async (request) => {
    sent = request;
    return performCaptureRequest(identity, request);
  });
  persistence.journal.admit(input);
  session.restoreUploads(persistence.journal);
  session.bindUploadContext(persistence.journal, identity, documentsClient);
  const selection = session.editor.getState().draft.selections[0];
  if (selection === undefined) throw new Error('Restored selection missing.');
  const upload = session.upload(selection.id);
  if (upload === undefined) throw new Error('Restored upload missing.');
  upload.intent.bindOwner(documentsClient);
  const pending = upload.intent.durable.recover({
    client: documentsClient,
    beforeRequest: () => {},
  });
  const deliver = async () => {
    await pending;
    upload.intent.update('taskId', accepted.taskId);
    session.updateUpload(selection.id)(upload.view());
  };
  if (!late) await deliver();
  session.editor.editDraft({ originalText: 'Keep this draft' });
  return {
    persistence,
    session,
    upload,
    selection,
    input,
    accepted,
    documentsClient,
    identity,
    requests,
    acknowledgement,
    deliver,
  };
}

it('allows the real generated Trips capture dispatch only under the original current upload authority', async () => {
  const owner = await fixture();
  await expect(owner.session.editor.capture()).resolves.toBe(true);
  expect(owner.requests).toHaveLength(1);
  expect(owner.requests[0]?.method).toBe('POST');
  expect(await owner.requests[0]?.json()).toMatchObject({
    command: {
      kind: 'capture.create',
      input: { attachments: [{ kind: 'task', taskId: 'task-A' }] },
    },
  });
});

it.each(['unknown', 'B', 'A after B'])(
  'blocks a retained real Capture callback under %s without losing the old draft or task receipt',
  async (changed) => {
    const owner = await fixture();
    const savedCapture = owner.session.editor.capture;
    owner.persistence.retire();
    const replacement = createTestUploadJournal(
      { tripId: 1, tripsOrigin: 'https://owner-a.test/trips-api' },
      { account: changed === 'B' ? 'account-b' : 'account-a', epoch: 'new-epoch' }
    );
    owner.session.bindUploadContext(
      changed === 'unknown' ? null : replacement.journal,
      owner.identity,
      owner.documentsClient
    );
    await expect(savedCapture.call(owner.session.editor)).resolves.toBe(false);
    expect(owner.requests).toEqual([]);
    expect(owner.session.editor.getState().draft.originalText).toBe('Keep this draft');
    expect(owner.session.editor.getState().draft.selections[0]?.references).toEqual([
      { kind: 'task', taskId: 'task-A' },
    ]);
    expect(owner.upload.intent.durable.readRecord()?.taskId).toBe('task-A');
    expect(owner.session.editor.getPendingRequest()).toBeNull();
  }
);

it('keeps a late A acceptance in its old session without letting the parent dispatch its task under B', async () => {
  const owner = await fixture(true);
  owner.persistence.retire();
  const b = createTestUploadJournal(
    { tripId: 1, tripsOrigin: 'https://owner-a.test/trips-api' },
    { account: 'account-b', epoch: 'epoch-b' }
  );
  owner.session.bindUploadContext(b.journal, owner.identity, owner.documentsClient);
  owner.acknowledgement.resolve(Response.json({ data: owner.accepted }));
  await owner.deliver();
  await expect(owner.session.editor.capture()).resolves.toBe(false);
  expect(owner.requests).toEqual([]);
  expect(owner.upload.intent.durable.readRecord()?.taskId).toBe('task-A');
  expect(owner.session.editor.getState().draft.originalText).toBe('Keep this draft');
});

it('retains the exact unresolved Capture request when its saved Retry is refused under another upload principal', async () => {
  const owner = await fixture(false, true);
  await expect(owner.session.editor.capture()).resolves.toBe(false);
  const pending = owner.session.editor.getPendingRequest();
  expect(pending).not.toBeNull();
  expect(owner.requests).toHaveLength(1);
  owner.persistence.retire();
  const b = createTestUploadJournal(
    { tripId: 1, tripsOrigin: 'https://owner-a.test/trips-api' },
    { account: 'account-b', epoch: 'epoch-b' }
  );
  owner.session.bindUploadContext(b.journal, owner.identity, owner.documentsClient);
  await expect(owner.session.editor.retry()).resolves.toBe(false);
  expect(owner.requests).toHaveLength(1);
  expect(owner.session.editor.getPendingRequest()).toEqual(pending);
  expect(owner.session.editor.getState().draft.originalText).toBe('Keep this draft');
  expect(owner.upload.intent.durable.readRecord()?.taskId).toBe('task-A');
});
