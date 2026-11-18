import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { client as defaultTripsClient } from '../trips-api/client.gen';
import {
  associatePaperlessDocument,
  loadDocumentAssociations,
  loadPaperlessDocument,
  loadPaperlessUploadPolicy,
  searchPaperlessDocuments,
  loadTripRouteVisitIds,
  loadTripDocumentTargets,
  unlinkPaperlessDocument,
} from './api';
import { DocumentUploadProvider } from './DocumentUploadProvider';
import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from './durable-upload-wire-test-utils';
import { TripDocumentsWorkspace } from './TripDocumentsWorkspace';

vi.mock('./api', () => ({
  associatePaperlessDocument: vi.fn(),
  loadDocumentAssociations: vi.fn(),
  loadPaperlessDocument: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
  loadTripRouteVisitIds: vi.fn(),
  loadTripDocumentTargets: vi.fn(),
  searchPaperlessDocuments: vi.fn(),
  paperlessOriginalUrl: (id: number) =>
    `/documents-api/paperless/documents/${String(id)}/download?original=true`,
  unlinkPaperlessDocument: vi.fn(),
}));

const loadLinks = vi.mocked(loadDocumentAssociations);
const loadOriginal = vi.mocked(loadPaperlessDocument);
const loadPolicy = vi.mocked(loadPaperlessUploadPolicy);
const loadVisitIds = vi.mocked(loadTripRouteVisitIds);
const loadTargetNames = vi.mocked(loadTripDocumentTargets);
const searchOwner = vi.mocked(searchPaperlessDocuments);
const unlink = vi.mocked(unlinkPaperlessDocument);
const associate = vi.mocked(associatePaperlessDocument);
const caches: QueryClient[] = [];
const originalDocuments = defaultDocumentsClient.getConfig();
const originalTrips = defaultTripsClient.getConfig();

afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  defaultDocumentsClient.setConfig(originalDocuments);
  defaultTripsClient.setConfig(originalTrips);
});

beforeEach(() => {
  vi.stubGlobal('crypto', uploadWebCrypto);
  loadTargetNames.mockResolvedValue(new Map());
});

function ownerWire(options: Parameters<typeof createDurableUploadWire>[0] = {}) {
  const wire = createDurableUploadWire({
    baseUrl: 'https://pops.example/documents-api',
    ...options,
  });
  defaultDocumentsClient.setConfig({
    baseUrl: 'https://pops.example/documents-api',
    fetch: wire.client.getConfig().fetch,
  });
  defaultTripsClient.setConfig({ baseUrl: 'https://pops.example/trips-api' });
  return wire;
}
function mount(wire = ownerWire(), initialTarget?: { kind: 'event'; id: number }) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  const tree = (target = initialTarget) => (
    <QueryClientProvider client={cache}>
      <DocumentUploadProvider tripId={4} host={wire.host}>
        <TripDocumentsWorkspace tripId={4} target={target} />
      </DocumentUploadProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { wire, cache, view, tree };
}
async function dispatchAt(wire: ReturnType<typeof ownerWire>, index = 0) {
  await waitFor(() => expect(wire.dispatches[index]).toBeDefined());
  const dispatch = wire.dispatches[index];
  if (dispatch === undefined) throw new Error('Durable dispatch missing.');
  return dispatch;
}
async function readAt(wire: ReturnType<typeof ownerWire>, index = 0) {
  await waitFor(() => expect(wire.reads[index]).toBeDefined());
  const read = wire.reads[index];
  if (read === undefined) throw new Error('Durable status read missing.');
  return read;
}
async function selectUpload(file = readableUploadFile('receipt', 'receipt.pdf')) {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  );
  await userEvent.upload(fileInput(), file);
  await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
}

describe('TripDocumentsWorkspace', () => {
  it('puts trip originals first, keeps source identities separate and opens the owner file', async () => {
    loadPolicy.mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    loadLinks.mockResolvedValue([
      {
        id: 1,
        tripId: 4,
        documentId: 11,
        targetKind: 'journey',
        targetId: 8,
        createdAt: '2026-11-09T00:00:00Z',
      },
      {
        id: 2,
        tripId: 4,
        documentId: 12,
        targetKind: 'trip',
        targetId: 4,
        createdAt: '2026-11-09T00:00:01Z',
      },
      {
        id: 3,
        tripId: 4,
        documentId: 13,
        targetKind: 'visit',
        targetId: 8,
        createdAt: '2026-11-09T00:00:02Z',
      },
    ]);
    loadVisitIds.mockResolvedValue([8]);
    loadTargetNames.mockResolvedValue(
      new Map([
        ['visit:8', { name: 'Porto', visitId: 8 }],
        ['journey:8', { name: 'Rail transfer', visitId: null }],
      ])
    );
    loadOriginal.mockImplementation(async (id) => ({
      id,
      title: `Document ${String(id)}`,
      created: '2026-11-09',
      originalFileName: `document-${String(id)}.pdf`,
      thumbnailUrl: '',
    }));
    mount();

    expect(await screen.findByRole('heading', { name: 'Trip documents' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Journey · Rail transfer' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Porto' })).toBeVisible();
    const groups = screen
      .getAllByRole('region')
      .filter((region) => region.getAttribute('aria-label'));
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Add files',
      'Trip documents',
      'Porto',
      'Visit documents',
      'Journey · Rail transfer',
    ]);
    const visitRegion = screen.getByRole('region', { name: 'Porto' });
    expect(within(visitRegion).getByRole('heading', { name: 'Porto', level: 2 })).toBeVisible();
    expect(
      within(visitRegion).getByRole('heading', { name: 'Visit documents', level: 3 })
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Trip documents', level: 2 })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Journey · Rail transfer', level: 2 })
    ).toBeVisible();
    expect(
      within(visitRegion).queryByRole('region', { name: 'Journey · Rail transfer' })
    ).toBeNull();
    const originalLinks = await screen.findAllByRole('link', { name: 'Open original' });
    expect(
      originalLinks.find((link) => link.getAttribute('href')?.includes('/12/'))
    ).toHaveAttribute('href', '/documents-api/paperless/documents/12/download?original=true');
  });

  it('keeps the original listed when owner resolution is unavailable and unlinks only the Trips association', async () => {
    loadPolicy.mockRejectedValue(new Error('owner unavailable'));
    loadLinks.mockResolvedValue([
      {
        id: 1,
        tripId: 4,
        documentId: 12,
        targetKind: 'trip',
        targetId: 4,
        createdAt: '2026-11-09T00:00:00Z',
      },
    ]);
    loadVisitIds.mockResolvedValue([]);
    loadOriginal.mockRejectedValue(new Error('missing original'));
    unlink.mockResolvedValue(undefined);
    mount();

    expect(await screen.findByText('Original unavailable · Documents ID 12')).toBeVisible();
    expect(
      screen.getByText('Documents is unavailable. Existing links remain visible.')
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Unlink Documents 12' }));
    await waitFor(() => expect(unlink).toHaveBeenCalledWith(4, 1, defaultTripsClient));
  });

  it('keeps independent existing-original selection available when upload recovery authority is absent', async () => {
    loadPolicy.mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    loadLinks.mockResolvedValue([]);
    loadVisitIds.mockResolvedValue([]);
    searchOwner.mockResolvedValue([
      {
        id: 72,
        title: 'Existing original',
        originalFileName: 'existing.pdf',
        created: '',
        thumbnailUrl: '',
      },
    ]);
    associate.mockResolvedValue({
      id: 2,
      tripId: 4,
      documentId: 72,
      targetKind: 'trip',
      targetId: 4,
      createdAt: '',
    });
    const wire = ownerWire();
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    caches.push(cache);
    render(
      <QueryClientProvider client={cache}>
        <TripDocumentsWorkspace tripId={4} />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent.click(screen.getByRole('button', { name: 'Choose existing document' }));
    await userEvent.type(screen.getByPlaceholderText('Search documents...'), 'existing');
    await userEvent.click(await screen.findByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(associate).toHaveBeenCalledWith(4, 72, { kind: 'trip', id: 4 }, undefined)
    );
    expect(searchOwner).toHaveBeenCalledWith('existing', undefined);
    expect(wire.createCount()).toBe(0);
    expect(wire.putCount()).toBe(0);
    expect(wire.dispatchCount()).toBe(0);
  });

  it('retains an ambiguous operation and File after an exact GET still cannot prove its dispatch outcome', async () => {
    loadPolicy.mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    loadLinks.mockResolvedValue([]);
    loadVisitIds.mockResolvedValue([]);
    const owner = mount();
    await selectUpload();
    const dispatch = await dispatchAt(owner.wire);
    await act(async () => dispatch.fail(new Error('Connection lost')));
    const input = dispatch.input;
    await userEvent.click(await screen.findByRole('button', { name: 'Check upload status' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check upload status' })).toBeEnabled()
    );
    expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove receipt.pdf' })).not.toBeInTheDocument();
    expect(searchOwner).not.toHaveBeenCalled();
    expect(owner.wire.records.get(input.operationId)?.state).toBe('outcome_unknown');
    expect(owner.wire.createCount()).toBe(1);
    expect(owner.wire.putCount()).toBe(1);
    expect(owner.wire.dispatchCount()).toBe(1);
    expect(
      owner.wire.requests.some(
        (request) =>
          request.url.endsWith(`/paperless/uploads/${input.operationId}`) &&
          request.method === 'GET'
      )
    ).toBe(true);
  });

  it('keeps an accepted task and exact File with its original target while switching away and back', async () => {
    loadPolicy.mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    loadLinks.mockResolvedValue([]);
    loadVisitIds.mockResolvedValue([]);
    associate.mockResolvedValue({
      id: 1,
      tripId: 4,
      documentId: 87,
      targetKind: 'event',
      targetId: 8,
      createdAt: '2026-11-09T00:00:00Z',
    });
    const owner = mount(ownerWire({ documentId: 87 }), { kind: 'event', id: 8 });
    const file = readableUploadFile('agenda', 'agenda.pdf');
    await selectUpload(file);
    const dispatch = await dispatchAt(owner.wire);
    owner.view.rerender(owner.tree({ kind: 'event', id: 9 }));
    expect(screen.queryByRole('button', { name: 'Link file' })).not.toBeInTheDocument();
    const other = readableUploadFile('other', 'other.pdf');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent.upload(fileInput(), other);
    expect(screen.getByRole('article', { name: 'Selected file other.pdf' })).toBeVisible();
    await act(async () => dispatch.accept('task-8'));
    owner.view.rerender(owner.tree({ kind: 'event', id: 8 }));
    expect(
      screen.queryByRole('article', { name: 'Selected file other.pdf' })
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Link file' }));
    await waitFor(() =>
      expect(associate).toHaveBeenCalledWith(4, 87, { kind: 'event', id: 8 }, undefined)
    );
    owner.view.rerender(owner.tree({ kind: 'event', id: 9 }));
    expect(screen.getByRole('article', { name: 'Selected file other.pdf' })).toBeVisible();
    expect(owner.wire.dispatchCount()).toBe(1);
    expect(dispatch.input.fileName).toBe(file.name);
  });
});

describe('independent file intents', () => {
  beforeEach(() => {
    loadPolicy.mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    loadLinks.mockResolvedValue([]);
    loadVisitIds.mockResolvedValue([]);
  });

  it('keeps same-name Files distinct and retries only the original rejected UUID after canonical GET proves it unclaimed', async () => {
    const first = readableUploadFile('first', 'booking.pdf');
    const second = readableUploadFile('other', 'booking.pdf');
    const owner = mount(ownerWire({ documentId: 42 }));
    associate.mockResolvedValue({
      id: 1,
      tripId: 4,
      documentId: 42,
      targetKind: 'trip',
      targetId: 4,
      createdAt: '',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    expect(fileInput()).toHaveAttribute('multiple');
    await userEvent.upload(fileInput(), [first, second]);
    const rows = screen.getAllByRole('article', { name: 'Selected file booking.pdf' });
    expect(rows).toHaveLength(2);
    await userEvent.click(
      within(requiredRow(rows, 0)).getByRole('button', { name: 'Send to Documents' })
    );
    const accepted = await dispatchAt(owner.wire, 0);
    await userEvent.click(
      within(requiredRow(rows, 1)).getByRole('button', { name: 'Send to Documents' })
    );
    const rejected = await dispatchAt(owner.wire, 1);
    expect(rejected.input.operationId).not.toBe(accepted.input.operationId);
    await act(async () => {
      accepted.accept('accepted-task');
      rejected.reject(409, {
        code: 'documents.upload.conflict',
        message: 'Not dispatched.',
        requestId: crypto.randomUUID(),
        retryable: false,
      });
    });
    const rejectedRow = requiredRow(rows, 1);
    await within(rejectedRow).findByRole('button', { name: 'Check upload status' });
    expect(within(rejectedRow).getByRole('button', { name: 'Send to Documents' })).toBeDisabled();
    expect(
      within(rejectedRow).queryByRole('button', { name: 'Remove booking.pdf' })
    ).not.toBeInTheDocument();
    await userEvent.click(
      await within(requiredRow(rows, 0)).findByRole('button', { name: 'Link file' })
    );
    await waitFor(() =>
      expect(associate).toHaveBeenCalledWith(4, 42, { kind: 'trip', id: 4 }, undefined)
    );
    await userEvent.click(within(rejectedRow).getByRole('button', { name: 'Check upload status' }));
    await waitFor(() =>
      expect(within(rejectedRow).getByRole('button', { name: 'Send to Documents' })).toBeEnabled()
    );
    await userEvent.click(within(rejectedRow).getByRole('button', { name: 'Send to Documents' }));
    const retry = await dispatchAt(owner.wire, 2);
    expect(retry.input).toEqual(rejected.input);
    expect(
      owner.wire.dispatches.filter(
        (entry) => entry.input.operationId === accepted.input.operationId
      )
    ).toHaveLength(1);
    expect(owner.wire.createCount()).toBe(2);
    expect(owner.wire.putCount()).toBe(2);
    await act(async () => retry.accept('second-task'));
  });

  it('retains unsupported Files and uses actual owner MIME and size policy without guessing', async () => {
    const owner = mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent
      .setup({ applyAccept: false })
      .upload(fileInput(), [
        readableUploadFile('unknown', 'looks-like.pdf', ''),
        readableUploadFile('x'.repeat(1001), 'large.pdf'),
        readableUploadFile('x'.repeat(1000), 'boundary.pdf'),
      ]);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(
      within(screen.getByRole('article', { name: 'Selected file looks-like.pdf' })).getByRole(
        'button',
        { name: 'Send to Documents' }
      )
    ).toBeDisabled();
    expect(
      within(screen.getByRole('article', { name: 'Selected file large.pdf' })).getByRole('button', {
        name: 'Send to Documents',
      })
    ).toBeDisabled();
    expect(
      within(screen.getByRole('article', { name: 'Selected file boundary.pdf' })).getByRole(
        'button',
        { name: 'Send to Documents' }
      )
    ).toBeEnabled();
    expect(owner.wire.createCount()).toBe(0);
    expect(owner.wire.putCount()).toBe(0);
    expect(owner.wire.dispatchCount()).toBe(0);
  });

  it('retries exact status lookup and linking without uploading the accepted original again', async () => {
    const owner = mount(ownerWire({ deferReads: true }));
    associate.mockRejectedValueOnce(new Error('Link unavailable'));
    associate.mockResolvedValue({
      id: 3,
      tripId: 4,
      documentId: 54,
      targetKind: 'trip',
      targetId: 4,
      createdAt: '',
    });
    await selectUpload(readableUploadFile('a', 'a.pdf'));
    const dispatch = await dispatchAt(owner.wire);
    await act(async () => dispatch.accept('accepted-task'));
    const firstRead = await readAt(owner.wire);
    await act(async () => firstRead.fail(new Error('Owner lookup unavailable')));
    await userEvent.click(await screen.findByRole('button', { name: 'Retry status check' }));
    const secondRead = await readAt(owner.wire, 1);
    await act(async () => secondRead.done(54));
    await userEvent.click(await screen.findByRole('button', { name: 'Link file' }));
    await screen.findByText(/The original is safe in Documents/);
    await userEvent.click(screen.getByRole('button', { name: 'Retry linking original' }));
    await waitFor(() => expect(associate).toHaveBeenCalledTimes(2));
    expect(associate).toHaveBeenLastCalledWith(4, 54, { kind: 'trip', id: 4 }, undefined);
    expect(owner.wire.reads).toHaveLength(2);
    expect(owner.wire.createCount()).toBe(1);
    expect(owner.wire.putCount()).toBe(1);
    expect(owner.wire.dispatchCount()).toBe(1);
  });

  it('rejects malformed completed proof without an original and retains the accepted task without linking', async () => {
    const owner = mount(ownerWire({ deferReads: true }));
    await selectUpload(readableUploadFile('a', 'a.pdf'));
    const dispatch = await dispatchAt(owner.wire);
    await act(async () => dispatch.accept('accepted-task'));
    const read = await readAt(owner.wire);
    await act(async () =>
      read.malformed({
        data: {
          input: dispatch.input,
          ownerMatches: true,
          state: 'done',
          taskId: 'accepted-task',
          documentId: null,
          reason: null,
          contentAvailable: true,
        },
      })
    );
    await screen.findByRole('button', { name: 'Retry status check' });
    expect(screen.queryByRole('button', { name: 'Link file' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Documents' })).not.toBeInTheDocument();
    expect(associate).not.toHaveBeenCalled();
    expect(owner.wire.records.get(dispatch.input.operationId)?.taskId).toBe('accepted-task');
    expect(owner.wire.dispatchCount()).toBe(1);
  });

  it('keeps uncertainty locked even when a lost-response error sentence says the file was rejected', async () => {
    const owner = mount();
    await selectUpload(readableUploadFile('a', 'a.pdf'));
    const dispatch = await dispatchAt(owner.wire);
    await act(async () => dispatch.fail(new Error('Documents rejected this file')));
    await screen.findByRole('button', { name: 'Check upload status' });
    expect(screen.queryByRole('button', { name: 'Remove a.pdf' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeDisabled();
    expect(owner.wire.dispatchCount()).toBe(1);
  });
});

function fileInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('FileUpload input was not mounted');
  return input;
}
function requiredRow(rows: HTMLElement[], index: number): HTMLElement {
  const row = rows[index];
  if (row === undefined) throw new Error('Selected file row missing.');
  return row;
}
