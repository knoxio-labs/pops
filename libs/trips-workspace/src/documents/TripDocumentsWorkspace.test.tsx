import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { client as defaultTripsClient } from '../trips-api/client.gen';
import {
  associatePaperlessDocument,
  loadDocumentAssociations,
  loadPaperlessDocument,
  loadPaperlessTask,
  loadPaperlessUploadPolicy,
  searchPaperlessDocuments,
  loadTripRouteVisitIds,
  loadTripDocumentTargets,
  unlinkPaperlessDocument,
  uploadPaperlessDocument,
} from './api';
import { TripDocumentsWorkspace } from './TripDocumentsWorkspace';

vi.mock('./api', () => ({
  associatePaperlessDocument: vi.fn(),
  loadDocumentAssociations: vi.fn(),
  loadPaperlessDocument: vi.fn(),
  loadPaperlessTask: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
  loadTripRouteVisitIds: vi.fn(),
  loadTripDocumentTargets: vi.fn(),
  searchPaperlessDocuments: vi.fn(),
  paperlessOriginalUrl: (id: number) =>
    `/documents-api/paperless/documents/${String(id)}/download?original=true`,
  unlinkPaperlessDocument: vi.fn(),
  uploadPaperlessDocument: vi.fn(),
}));

const loadLinks = vi.mocked(loadDocumentAssociations);
const loadOriginal = vi.mocked(loadPaperlessDocument);
const loadTask = vi.mocked(loadPaperlessTask);
const loadPolicy = vi.mocked(loadPaperlessUploadPolicy);
const loadVisitIds = vi.mocked(loadTripRouteVisitIds);
const loadTargetNames = vi.mocked(loadTripDocumentTargets);
const searchOwner = vi.mocked(searchPaperlessDocuments);
const unlink = vi.mocked(unlinkPaperlessDocument);
const upload = vi.mocked(uploadPaperlessDocument);
const associate = vi.mocked(associatePaperlessDocument);
const caches: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});

beforeEach(() => {
  loadTargetNames.mockResolvedValue(new Map());
});

function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <TripDocumentsWorkspace tripId={4} />
    </QueryClientProvider>
  );
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

  it('locks an ambiguous upload and requires a Documents lookup before releasing the selected file', async () => {
    loadPolicy.mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    loadLinks.mockResolvedValue([]);
    loadVisitIds.mockResolvedValue([]);
    upload.mockRejectedValue(new Error('connection lost'));
    searchOwner.mockResolvedValue([]);
    mount();

    await userEvent.click(await screen.findByRole('button', { name: /^Upload a file/ }));
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('FileUpload input was not mounted');
    await userEvent.upload(
      input,
      new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));

    expect(await screen.findByText(/Search Documents for this filename/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Search Documents for receipt.pdf' }));
    expect(await screen.findByText('No matching originals found.')).toBeVisible();
    expect(searchOwner).toHaveBeenCalledWith('receipt.pdf', undefined);
    await userEvent.click(
      await screen.findByRole('button', { name: 'No original found; choose a different file' })
    );

    expect(screen.queryByText('Search Documents for receipt.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Documents' })).not.toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('keeps an accepted task with its original target while switching away and back', async () => {
    let acceptUpload: ((taskId: string) => void) | undefined;
    upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          acceptUpload = resolve;
        })
    );
    loadPolicy.mockResolvedValue({
      configured: true,
      available: true,
      maxUploadBytes: 1000,
      allowedMimeTypes: ['application/pdf'],
    });
    loadLinks.mockResolvedValue([]);
    loadVisitIds.mockResolvedValue([]);
    loadTargetNames.mockResolvedValue(new Map());
    loadTask.mockResolvedValue({ state: 'done', documentId: 87, reason: null });
    associate.mockResolvedValue({
      id: 1,
      tripId: 4,
      documentId: 87,
      targetKind: 'event',
      targetId: 8,
      createdAt: '2026-11-09T00:00:00Z',
    });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
    });
    caches.push(cache);
    const view = render(
      <QueryClientProvider client={cache}>
        <TripDocumentsWorkspace tripId={4} target={{ kind: 'event', id: 8 }} />
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Upload a file/ }));
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('FileUpload input was not mounted');
    await userEvent.upload(input, new File(['agenda'], 'agenda.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    view.rerender(
      <QueryClientProvider client={cache}>
        <TripDocumentsWorkspace tripId={4} target={{ kind: 'event', id: 9 }} />
      </QueryClientProvider>
    );
    expect(screen.queryByRole('button', { name: 'Link file' })).toBeNull();
    await userEvent.upload(
      fileInput(),
      new File(['other'], 'other.pdf', { type: 'application/pdf' })
    );
    expect(screen.getByRole('article', { name: 'Selected file other.pdf' })).toBeVisible();
    const resolveAcceptance = acceptUpload;
    if (resolveAcceptance === undefined) throw new Error('Upload acceptance was not captured');
    await act(async () => resolveAcceptance('task-8'));

    view.rerender(
      <QueryClientProvider client={cache}>
        <TripDocumentsWorkspace tripId={4} target={{ kind: 'event', id: 8 }} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(loadTask).toHaveBeenCalledWith('task-8', undefined));
    expect(screen.queryByRole('article', { name: 'Selected file other.pdf' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Link file' }));
    await waitFor(() =>
      expect(associate).toHaveBeenCalledWith(4, 87, { kind: 'event', id: 8 }, undefined)
    );
    view.rerender(
      <QueryClientProvider client={cache}>
        <TripDocumentsWorkspace tripId={4} target={{ kind: 'event', id: 9 }} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('article', { name: 'Selected file other.pdf' })).toBeVisible();
    expect(upload).toHaveBeenCalledTimes(1);
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

  it('keeps same-name files distinct and never resends a successful file after another is rejected', async () => {
    const accepted = new File(['first'], 'booking.pdf', {
      type: 'application/pdf',
      lastModified: 1,
    });
    const rejected = new File(['other'], 'booking.pdf', {
      type: 'application/pdf',
      lastModified: 1,
    });
    upload.mockImplementation(async (file) => {
      if (file === rejected)
        throw new ApiError({
          code: 'paperless.unsupported_media_type',
          message: 'The upload response was interrupted',
          kind: 'client',
          retryable: false,
          status: 415,
        });
      return 'accepted-task';
    });
    loadTask.mockResolvedValue({ state: 'done', documentId: 42, reason: null });
    associate.mockResolvedValue({
      id: 1,
      tripId: 4,
      documentId: 42,
      targetKind: 'trip',
      targetId: 4,
      createdAt: '',
    });
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    const input = fileInput();
    expect(input).toHaveAttribute('multiple');
    await userEvent.upload(input, [accepted, rejected]);
    const rows = screen.getAllByRole('article', { name: 'Selected file booking.pdf' });
    expect(rows).toHaveLength(2);
    await userEvent.click(
      within(requiredRow(rows, 0)).getByRole('button', { name: 'Send to Documents' })
    );
    await userEvent.click(
      within(requiredRow(rows, 1)).getByRole('button', { name: 'Send to Documents' })
    );
    expect(
      await within(requiredRow(rows, 1)).findByText(/Documents rejected this file/)
    ).toBeVisible();
    expect(
      within(requiredRow(rows, 1)).queryByRole('button', { name: /Search Documents for booking/ })
    ).not.toBeInTheDocument();
    expect(
      within(requiredRow(rows, 1)).getByRole('button', { name: 'Send to Documents' })
    ).toBeDisabled();
    await userEvent.click(
      await within(requiredRow(rows, 0)).findByRole('button', {
        name: 'Link file',
      })
    );
    await waitFor(() =>
      expect(associate).toHaveBeenCalledWith(4, 42, { kind: 'trip', id: 4 }, undefined)
    );
    await userEvent.click(
      within(requiredRow(rows, 1)).getByRole('button', { name: 'Remove booking.pdf' })
    );
    const replacement = new File(['replacement'], 'new.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, replacement);
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    expect(upload.mock.calls.map(([file]) => file)).toEqual([accepted, rejected, replacement]);
  });

  it('retains unsupported selected files and uses the owner MIME and size policy without guessing', async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent
      .setup({ applyAccept: false })
      .upload(fileInput(), [
        new File(['unknown'], 'looks-like.pdf'),
        new File(['x'.repeat(1001)], 'large.pdf', { type: 'application/pdf' }),
        new File(['x'.repeat(1000)], 'boundary.pdf', { type: 'application/pdf' }),
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
    expect(upload).not.toHaveBeenCalled();
  });

  it('retries task lookup and linking without uploading an accepted original again', async () => {
    upload.mockResolvedValue('accepted-task');
    loadTask.mockRejectedValueOnce(new Error('owner lookup unavailable'));
    loadTask.mockResolvedValue({ state: 'duplicate', documentId: 54, reason: null });
    associate.mockRejectedValueOnce(new Error('link unavailable'));
    associate.mockResolvedValue({
      id: 3,
      tripId: 4,
      documentId: 54,
      targetKind: 'trip',
      targetId: 4,
      createdAt: '',
    });
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent.upload(fileInput(), new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Retry status check' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Link file' }));
    expect(await screen.findByText(/The original is safe in Documents/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Retry linking original' }));
    await waitFor(() => expect(associate).toHaveBeenCalledTimes(2));
    expect(associate).toHaveBeenLastCalledWith(4, 54, { kind: 'trip', id: 4 }, undefined);
    expect(loadTask).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('does not link a completed owner task that omitted its canonical original identity', async () => {
    upload.mockResolvedValue('accepted-task');
    loadTask.mockResolvedValue({ state: 'done', documentId: null, reason: null });
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent.upload(fileInput(), new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
    expect(
      await screen.findByText('Documents returned a completed task without an original identity.')
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Link file' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Documents' })).not.toBeInTheDocument();
    expect(associate).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('uses the typed failure rather than an error sentence to guard an uncertain outcome', async () => {
    upload.mockRejectedValue(new Error('Documents rejected this file'));
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent.upload(fileInput(), new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
    expect(await screen.findByRole('button', { name: 'Search Documents for a.pdf' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove a.pdf' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeDisabled();
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

function fileInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('FileUpload input was not mounted');
  return input;
}

function requiredRow(rows: HTMLElement[], index: number): HTMLElement {
  const row = rows[index];
  if (!row) throw new Error('Selected file row was not mounted');
  return row;
}
