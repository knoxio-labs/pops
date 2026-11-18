import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import {
  associatePaperlessDocument,
  loadDocumentAssociations,
  loadPaperlessUploadPolicy,
} from '../documents/api';
import { DocumentUploadProvider } from '../documents/DocumentUploadProvider';
import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from '../documents/durable-upload-wire-test-utils';
import { createClient as createTripsClient } from '../trips-api/client';
import { client as defaultTripsClient } from '../trips-api/client.gen';
import { sourceUploadSession } from './source-upload-sessions';
import { SourceDocuments } from './SourceDocuments';

import type { TripDocumentUploadContext } from '../documents/trip-document-upload-session';
import type { DocumentAssociationTarget } from '../documents/types';

vi.mock('../documents/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../documents/api')>()),
  associatePaperlessDocument: vi.fn(),
  loadDocumentAssociations: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
}));
const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const originalDocumentsConfig = defaultDocumentsClient.getConfig();
const originalTripsConfig = defaultTripsClient.getConfig();
beforeEach(() => vi.stubGlobal('crypto', uploadWebCrypto));
afterEach(() => {
  cleanup();
  cache.clear();
  vi.resetAllMocks();
  defaultDocumentsClient.setConfig({
    ...originalDocumentsConfig,
    fetch: originalDocumentsConfig.fetch,
  });
  defaultTripsClient.setConfig(originalTripsConfig);
  vi.unstubAllGlobals();
});

it('retains a late accepted upload across host unmount and cache eviction without binding it to another source', async () => {
  const owner = createDurableUploadWire({ taskId: 'accepted-event-19', documentId: 91 });
  defaultDocumentsClient.setConfig(owner.client.getConfig());
  defaultTripsClient.setConfig({ baseUrl: `${owner.persistence.lease.identity.server}/trips-api` });
  vi.mocked(loadPaperlessUploadPolicy).mockResolvedValue({
    configured: true,
    available: true,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
  });
  vi.mocked(loadDocumentAssociations).mockResolvedValue([]);
  vi.mocked(associatePaperlessDocument).mockResolvedValue({
    id: 81,
    tripId: 7,
    targetKind: 'event',
    targetId: 19,
    documentId: 91,
    createdAt: '2029-01-01T00:00:00Z',
  });
  const mount = (target: DocumentAssociationTarget) =>
    render(
      <QueryClientProvider client={cache}>
        <DocumentUploadProvider tripId={7} host={owner.host}>
          <SourceDocuments tripId={7} target={target} />
        </DocumentUploadProvider>
      </QueryClientProvider>
    );
  const first = mount({ kind: 'event', id: 19 });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('Source file input is missing');
  const file = readableUploadFile('ticket', 'ticket.pdf');
  await userEvent.upload(input, file);
  await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
  await waitFor(() => expect(owner.dispatches).toHaveLength(1));
  const retained = sourceUploadSession(
    cache,
    {
      tripId: 7,
      target: { kind: 'event', id: 19 },
    },
    owner
      .createJournal({
        tripId: 7,
        target: { kind: 'event', id: 19 },
        tripsOrigin: `${owner.persistence.lease.identity.server}/trips-api`,
        documentsOrigin: owner.client.getConfig().baseUrl ?? '',
      })
      .bindingKey()
  );
  expect(retained.read()[0]?.file).toBe(file);
  expect(owner.createCount()).toBe(1);
  expect(owner.putCount()).toBe(1);
  const pending = owner.dispatches[0];
  if (pending === undefined) throw new Error('No pending durable dispatch');
  first.unmount();
  cache.clear();
  const other = mount({ kind: 'stay', id: 19 });
  await act(async () => pending.accept('accepted-event-19'));
  expect(
    screen.queryByRole('article', { name: 'Selected file ticket.pdf' })
  ).not.toBeInTheDocument();
  expect(associatePaperlessDocument).not.toHaveBeenCalled();
  other.unmount();
  mount({ kind: 'event', id: 19 });
  await userEvent.click(await screen.findByRole('button', { name: 'Link file' }));
  await waitFor(() =>
    expect(associatePaperlessDocument).toHaveBeenCalledWith(
      7,
      91,
      { kind: 'event', id: 19 },
      undefined
    )
  );
  expect(owner.dispatchCount()).toBe(1);
  expect(retained.read()[0]?.file).toBe(file);
  expect(
    owner.requests.some(
      (request) =>
        request.method === 'GET' &&
        new URL(request.url).pathname.endsWith(`/paperless/uploads/${pending.input.operationId}`)
    )
  ).toBe(true);
});

it.each(['trips', 'documents'] as const)(
  'hides retained files when the active %s client changes at the same origin, restoring only the original context',
  async (owner) => {
    const wire = createDurableUploadWire();
    vi.mocked(loadPaperlessUploadPolicy).mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    vi.mocked(loadDocumentAssociations).mockResolvedValue([]);
    const original: TripDocumentUploadContext = {
      tripId: 7,
      target: { kind: 'event', id: 19 },
      tripsClient: createTripsClient({
        baseUrl: `${wire.persistence.lease.identity.server}/trips-api`,
      }),
      documentsClient: wire.client,
    };
    const replacement = {
      ...original,
      ...(owner === 'trips'
        ? { tripsClient: createTripsClient(original.tripsClient?.getConfig()) }
        : { documentsClient: createDocumentsClient(original.documentsClient?.getConfig()) }),
    };
    const content = (context: TripDocumentUploadContext) => (
      <QueryClientProvider client={cache}>
        <DocumentUploadProvider {...context} host={wire.host}>
          <SourceDocuments {...context} />
        </DocumentUploadProvider>
      </QueryClientProvider>
    );
    const view = render(content(original));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('Source file input is missing');
    const file = readableUploadFile('private A', 'private-a.pdf');
    await userEvent.upload(input, file);
    expect(
      await screen.findByRole('article', { name: 'Selected file private-a.pdf' })
    ).toBeVisible();
    view.rerender(content(replacement));
    expect(
      screen.queryByRole('article', { name: 'Selected file private-a.pdf' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Documents' })).not.toBeInTheDocument();
    view.rerender(content(original));
    expect(
      await screen.findByRole('article', { name: 'Selected file private-a.pdf' })
    ).toBeVisible();
    const journal = wire.createJournal({
      tripId: 7,
      target: original.target,
      tripsOrigin: `${wire.persistence.lease.identity.server}/trips-api`,
      documentsOrigin: wire.client.getConfig().baseUrl ?? '',
    });
    expect(sourceUploadSession(cache, original, journal.bindingKey()).read()[0]?.file).toBe(file);
    expect(wire.createCount()).toBe(0);
    expect(wire.putCount()).toBe(0);
    expect(wire.dispatchCount()).toBe(0);
    expect(associatePaperlessDocument).not.toHaveBeenCalled();
  }
);
