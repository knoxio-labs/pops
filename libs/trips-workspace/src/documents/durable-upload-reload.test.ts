// @vitest-environment node
import { expect, it } from 'vitest';

import { createClient } from '../documents-api/client';
import { DurableUploadOperation } from './durable-upload-operation';
import { createTestUploadJournal } from './durable-upload-test-utils';

import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';
import type { UploadJournal } from './durable-upload-journal';

function descriptor(): DurableUploadInput {
  return {
    operationId: crypto.randomUUID(),
    fileName: 'booking.pdf',
    mimeType: 'application/pdf',
    byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
}

function records(input: DurableUploadInput) {
  const awaiting: DurableUploadRecord = {
    input,
    ownerMatches: true,
    state: 'awaiting_content',
    contentAvailable: false,
    taskId: null,
    documentId: null,
    reason: null,
  };
  const admitted: DurableUploadRecord = { ...awaiting, state: 'admitted', contentAvailable: true };
  const accepted: DurableUploadRecord = { ...admitted, state: 'accepted', taskId: 'owner-task-1' };
  const done: DurableUploadRecord = { ...accepted, state: 'done', documentId: 8 };
  const unknown: DurableUploadRecord = {
    ...awaiting,
    state: 'outcome_unknown',
    contentAvailable: true,
    blockedBy: 'dispatch_unproven',
  };
  return { awaiting, admitted, accepted, done, unknown };
}

function restore(journal: UploadJournal): DurableUploadOperation {
  const input = journal.list()[0];
  if (input === undefined) throw new Error('Persisted descriptor missing.');
  return DurableUploadOperation.restore(input, journal);
}

function proof(record: DurableUploadRecord): Response {
  return Response.json({ data: record });
}

function transportFor(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init);
    requests.push(request);
    return respond(request);
  };
  return {
    client: createClient({ baseUrl: 'https://owner-a.test/documents-api', fetch: fetcher }),
    beforeRequest: () => {},
    requests,
    paths: () => requests.map((request) => `${request.method} ${new URL(request.url).pathname}`),
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred upload was not initialized.');
  };
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('restores metadata without a File and recovers an unknown outcome through GET only', async () => {
  const persistence = createTestUploadJournal();
  const input = descriptor();
  persistence.journal.admit(input);
  const reloaded = restore(persistence.reload());
  const owner = records(input);
  const transport = transportFor(() => proof(owner.unknown));
  await expect(reloaded.start(transport)).rejects.toThrow();
  expect(transport.paths()).toEqual([]);
  await expect(reloaded.recover(transport)).resolves.toEqual(owner.unknown);
  await expect(reloaded.start(transport)).rejects.toThrow();
  await expect(reloaded.reattach(new File(['abc'], 'booking.pdf'))).rejects.toThrow();
  expect(transport.paths()).toEqual([`GET /documents-api/paperless/uploads/${input.operationId}`]);
  expect(reloaded.readInput()).toEqual(input);
  expect(persistence.journal.list()).toEqual([input]);
});

it('keeps restored admitted metadata GET-only until explicit fingerprint verification, then dispatches without resending bytes', async () => {
  const persistence = createTestUploadJournal();
  const input = descriptor();
  persistence.journal.admit(input);
  const reloaded = restore(persistence.reload());
  const owner = records(input);
  const transport = transportFor((request) =>
    proof(request.method === 'GET' ? owner.admitted : owner.accepted)
  );
  await expect(reloaded.start(transport)).rejects.toThrow();
  await expect(reloaded.recover(transport)).resolves.toEqual(owner.admitted);
  expect(transport.paths()).toEqual([`GET /documents-api/paperless/uploads/${input.operationId}`]);
  await expect(reloaded.start(transport)).rejects.toThrow('Reattach');
  await expect(reloaded.reattach(new File(['xyz'], 'booking.pdf'))).rejects.toThrow('fingerprint');
  expect(transport.paths()).toEqual([`GET /documents-api/paperless/uploads/${input.operationId}`]);
  await reloaded.reattach(new File(['abc'], 'renamed.pdf'));
  await expect(reloaded.start(transport)).resolves.toEqual(owner.accepted);
  expect(transport.paths()).toEqual([
    `GET /documents-api/paperless/uploads/${input.operationId}`,
    `POST /documents-api/paperless/uploads/${input.operationId}/dispatch`,
  ]);
  expect(reloaded.readInput()).toEqual(input);
});

it('requires canonical awaiting proof and the original fingerprint before explicit same-UUID content continuation', async () => {
  const persistence = createTestUploadJournal();
  const input = descriptor();
  persistence.journal.admit(input);
  const reloaded = restore(persistence.reload());
  const owner = records(input);
  const transport = transportFor(async (request) => {
    if (request.method === 'GET') return proof(owner.awaiting);
    if (request.method === 'PUT') {
      expect(await request.text()).toBe('abc');
      expect(request.headers.get('Content-Type')).toBe(input.mimeType);
      return proof(owner.admitted);
    }
    return proof(owner.accepted);
  });
  await expect(reloaded.reattach(new File(['abc'], 'booking.pdf'))).rejects.toThrow();
  expect(transport.paths()).toEqual([]);
  await expect(reloaded.recover(transport)).resolves.toEqual(owner.awaiting);
  await expect(reloaded.start(transport)).rejects.toThrow('original selected File');
  await expect(reloaded.reattach(new File(['xyz'], 'booking.pdf'))).rejects.toThrow('fingerprint');
  await expect(reloaded.reattach(new File(['abcd'], 'booking.pdf'))).rejects.toThrow('fingerprint');
  expect(transport.paths()).toEqual([`GET /documents-api/paperless/uploads/${input.operationId}`]);
  await reloaded.reattach(new File(['abc'], 'renamed.pdf', { type: 'application/octet-stream' }));
  expect(transport.paths()).toHaveLength(1);
  await expect(reloaded.start(transport)).resolves.toEqual(owner.accepted);
  expect(transport.paths()).toEqual([
    `GET /documents-api/paperless/uploads/${input.operationId}`,
    `PUT /documents-api/paperless/uploads/${input.operationId}/content`,
    `POST /documents-api/paperless/uploads/${input.operationId}/dispatch`,
  ]);
  expect(reloaded.readInput()).toEqual(input);
});

it('sends no owner write unless the real journal admits and reads back the immutable input', async () => {
  const persistence = createTestUploadJournal();
  const input = descriptor();
  const operation = new DurableUploadOperation(
    input.operationId,
    new File(['abc'], input.fileName, { type: input.mimeType })
  );
  operation.bindJournal(persistence.journal);
  persistence.failWrites();
  const transport = transportFor(() => proof(records(input).awaiting));
  await expect(operation.start(transport)).rejects.toThrow('storage write failed');
  expect(transport.paths()).toEqual([]);
  expect(persistence.storage.size).toBe(0);
  expect(operation.readInput()).toEqual(input);
});

it('retains a late accepted owner acknowledgement after lease retirement without resurrecting journal metadata', async () => {
  const persistence = createTestUploadJournal();
  const input = descriptor();
  const owner = records(input);
  const operation = new DurableUploadOperation(
    input.operationId,
    new File(['abc'], input.fileName, { type: input.mimeType })
  );
  operation.bindJournal(persistence.journal);
  const enteredDispatch = deferred<void>();
  const finishDispatch = deferred<Response>();
  const transport = transportFor((request) => {
    if (request.method === 'PUT') return proof(owner.admitted);
    if (request.url.endsWith('/dispatch')) {
      enteredDispatch.resolve();
      return finishDispatch.promise;
    }
    return proof(owner.awaiting);
  });
  const pending = operation.start(transport);
  await enteredDispatch.promise;
  expect(persistence.journal.list()).toEqual([input]);
  persistence.retire();
  finishDispatch.resolve(proof(owner.accepted));
  await expect(pending).resolves.toEqual(owner.accepted);
  expect(operation.readRecord()?.taskId).toBe(owner.accepted.taskId);
  expect(persistence.storage.size).toBe(0);
  const count = transport.requests.length;
  await expect(operation.start(transport)).resolves.toEqual(owner.accepted);
  expect(transport.requests).toHaveLength(count);
  expect(persistence.storage.size).toBe(0);
});

it('removes only the completed operation from a reloaded journal after canonical owner proof', async () => {
  const persistence = createTestUploadJournal();
  const input = descriptor();
  const sibling = descriptor();
  persistence.journal.admit(input);
  persistence.journal.admit(sibling);
  const reloaded = restore(persistence.reload());
  const owner = records(input);
  const transport = transportFor(() => proof(owner.done));
  await expect(reloaded.recover(transport)).resolves.toEqual(owner.done);
  expect(persistence.journal.list()).toEqual([sibling]);
  expect(reloaded.readRecord()).toEqual(owner.done);
  expect(transport.paths()).toEqual([`GET /documents-api/paperless/uploads/${input.operationId}`]);
});
