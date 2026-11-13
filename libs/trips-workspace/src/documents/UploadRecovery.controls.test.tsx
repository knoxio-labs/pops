import { webcrypto } from 'node:crypto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { createClient as createTripsClient } from '../trips-api/client';
import { DocumentUploadSession } from './document-upload-session';
import { createTestUploadJournal } from './durable-upload-test-utils';
import { UploadContent } from './UploadContent';
import { useTripDocumentUpload } from './useTripDocumentUpload';

import type { PaperlessStatusResponses } from '../documents-api/types.gen';
import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';
import type { DocumentAssociationTarget } from './types';

const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.unstubAllGlobals();
});

class ReadableFile extends File {
  override arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('The file reader did not return bytes.'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
      reader.readAsArrayBuffer(this);
    });
  }
}

function harness(options?: { selected?: File; allowedMimeTypes?: string[] }) {
  const target: DocumentAssociationTarget = { kind: 'stay', id: 8 };
  const persistence = createTestUploadJournal({
    tripsOrigin: 'https://owner-a.test/trips-api',
    target,
  });
  const input: DurableUploadInput = {
    operationId: crypto.randomUUID(),
    fileName: 'original-booking.pdf',
    mimeType: 'application/pdf',
    byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
  const awaiting: DurableUploadRecord = {
    input,
    state: 'awaiting_content',
    ownerMatches: true,
    contentAvailable: false,
    taskId: null,
    documentId: null,
    reason: null,
  };
  const admitted: DurableUploadRecord = { ...awaiting, state: 'admitted', contentAvailable: true };
  const accepted: DurableUploadRecord = { ...admitted, state: 'accepted', taskId: 'owner-task-1' };
  const policy: PaperlessStatusResponses[200] = {
    data: {
      configured: true,
      available: true,
      baseUrl: null,
      documentCount: null,
      maxUploadBytes: 1000,
      allowedMimeTypes: options?.allowedMimeTypes ?? ['application/pdf'],
    },
  };
  let dispatched = false;
  const requests: Request[] = [];
  const rawBodies: { body: unknown; contentType: string | null; serializer: unknown }[] = [];
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init);
    requests.push(request);
    if (request.url.endsWith('/paperless/status')) return Response.json(policy);
    if (request.method === 'GET') return Response.json({ data: dispatched ? accepted : awaiting });
    if (request.method === 'PUT') return Response.json({ data: admitted });
    if (request.url.endsWith('/dispatch')) {
      dispatched = true;
      return Response.json({ data: accepted });
    }
    throw new Error('A restored upload must not create another operation.');
  };
  const documentsClient = createClient({
    baseUrl: 'https://owner-a.test/documents-api',
    fetch: fetcher,
  });
  documentsClient.interceptors.request.use((request, requestOptions) => {
    if (request.method === 'PUT')
      rawBodies.push({
        body: requestOptions.body,
        contentType: request.headers.get('Content-Type'),
        serializer: requestOptions.bodySerializer,
      });
    return request;
  });
  const tripsClient = createTripsClient({
    baseUrl: 'https://owner-a.test/trips-api',
    fetch: async () => {
      throw new Error('Recovery controls must not create a Trips association.');
    },
  });
  let initial: DocumentUploadSession;
  if (options?.selected === undefined) {
    persistence.journal.admit(input);
    initial = DocumentUploadSession.restore(input, persistence.journal);
  } else initial = DocumentUploadSession.create(options.selected);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  function Controls() {
    const [session, setSession] = useState(initial);
    const workflow = useTripDocumentUpload({
      tripId: 7,
      target,
      documentsClient,
      tripsClient,
      storage: { session, onSessionChange: setSession, journal: persistence.journal },
    });
    return (
      <UploadContent
        workflow={workflow}
        tripId={7}
        target={target}
        tripsClient={tripsClient}
        documentsClient={documentsClient}
        active
      />
    );
  }
  const view = render(
    <QueryClientProvider client={cache}>
      <Controls />
    </QueryClientProvider>
  );
  return {
    ...view,
    input,
    initial,
    rawBodies,
    writes: () => requests.filter((request) => request.method !== 'GET'),
  };
}

async function recoveryInput(container: HTMLElement): Promise<HTMLInputElement> {
  await screen.findByText('Select the original file to resume');
  const picker = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (picker === null) throw new Error('Actual recovery file input missing.');
  await waitFor(() => expect(picker).toBeEnabled());
  return picker;
}

it.each(['application/octet-stream', ''])(
  'verifies renamed bytes with candidate MIME %j and sends only after explicit Send using retained metadata',
  async (mimeType) => {
    const owner = harness();
    const user = userEvent.setup();
    const picker = await recoveryInput(owner.container);
    expect(picker).not.toHaveAttribute('accept');
    const candidate = new ReadableFile(['abc'], 'renamed.bin', { type: mimeType });
    await user.upload(picker, candidate);
    const send = await screen.findByRole('button', { name: 'Send to Documents' });
    await waitFor(() => expect(send).toBeEnabled());
    expect(owner.initial.file).toBe(candidate);
    expect(owner.initial.intent.durable.readInput()).toEqual(owner.input);
    expect(screen.getByText(/original-booking\.pdf/)).toBeInTheDocument();
    expect(owner.writes()).toEqual([]);
    await user.click(send);
    await waitFor(() => expect(owner.initial.taskId).toBe('owner-task-1'));
    expect(
      owner.writes().map((request) => `${request.method} ${new URL(request.url).pathname}`)
    ).toEqual([
      `PUT /documents-api/paperless/uploads/${owner.input.operationId}/content`,
      `POST /documents-api/paperless/uploads/${owner.input.operationId}/dispatch`,
    ]);
    expect(owner.rawBodies).toHaveLength(1);
    expect(owner.rawBodies[0]?.body).toBe(candidate);
    expect(owner.rawBodies[0]?.contentType).toBe(owner.input.mimeType);
    expect(owner.rawBodies[0]?.serializer).toBeNull();
  }
);

it('rejects wrong bytes through the actual recovery picker without permitting Send or an owner write', async () => {
  const owner = harness();
  const picker = await recoveryInput(owner.container);
  await userEvent
    .setup()
    .upload(picker, new ReadableFile(['xyz'], 'renamed.bin', { type: 'application/octet-stream' }));
  await screen.findByText(/does not match the retained upload fingerprint/);
  expect(owner.initial.file).toBeNull();
  expect(owner.initial.intent.durable.readInput()).toEqual(owner.input);
  expect(screen.queryByRole('button', { name: 'Send to Documents' })).not.toBeInTheDocument();
  expect(owner.writes()).toEqual([]);
});

it.each(['application/octet-stream', ''])(
  'keeps an unverified new selection with MIME %j subject to the owner policy',
  async (mimeType) => {
    const owner = harness({
      selected: new ReadableFile(['abc'], 'new-file.bin', { type: mimeType }),
    });
    const send = await screen.findByRole('button', { name: 'Send to Documents' });
    await screen.findByText(/unsupported file type/);
    expect(send).toBeDisabled();
    await userEvent.setup().click(send);
    expect(owner.writes()).toEqual([]);
    expect(owner.initial.intent.durable.readInput()).toBeNull();
  }
);

it('still applies the current owner allowlist to verified retained metadata', async () => {
  const owner = harness({ allowedMimeTypes: ['image/png'] });
  const picker = await recoveryInput(owner.container);
  await userEvent
    .setup()
    .upload(picker, new ReadableFile(['abc'], 'renamed.bin', { type: 'image/png' }));
  const send = await screen.findByRole('button', { name: 'Send to Documents' });
  await screen.findByText(/unsupported file type/);
  expect(send).toBeDisabled();
  expect(owner.writes()).toEqual([]);
});
