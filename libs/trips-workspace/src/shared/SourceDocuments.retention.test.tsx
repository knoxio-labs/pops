import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import {
  associatePaperlessDocument,
  loadDocumentAssociations,
  loadPaperlessTask,
  loadPaperlessUploadPolicy,
  uploadPaperlessDocument,
} from '../documents/api';
import { createClient as createTripsClient } from '../trips-api/client';
import { sourceUploadSession } from './source-upload-sessions';
import { SourceDocuments } from './SourceDocuments';

import type { TripDocumentUploadContext } from '../documents/trip-document-upload-session';
import type { DocumentAssociationTarget } from '../documents/types';

vi.mock('../documents/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../documents/api')>()),
  associatePaperlessDocument: vi.fn(),
  loadDocumentAssociations: vi.fn(),
  loadPaperlessTask: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
  uploadPaperlessDocument: vi.fn(),
}));
const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => {
  cleanup();
  cache.clear();
  vi.resetAllMocks();
});

it('retains a late accepted upload across host unmount and cache eviction without binding it to another source', async () => {
  let accept: (taskId: string) => void = () => {
    throw new Error('No pending upload');
  };
  vi.mocked(uploadPaperlessDocument).mockImplementation(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      })
  );
  vi.mocked(loadPaperlessUploadPolicy).mockResolvedValue({
    configured: true,
    available: true,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
  });
  vi.mocked(loadDocumentAssociations).mockResolvedValue([]);
  vi.mocked(loadPaperlessTask).mockResolvedValue({ state: 'done', documentId: 91, reason: null });
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
        <SourceDocuments tripId={7} target={target} />
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
  const file = new File(['ticket'], 'ticket.pdf', { type: 'application/pdf' });
  await userEvent.upload(input, file);
  await userEvent.click(screen.getByRole('button', { name: 'Send to Documents' }));
  await waitFor(() => expect(uploadPaperlessDocument).toHaveBeenCalledTimes(1));
  first.unmount();
  cache.clear();
  const other = mount({ kind: 'stay', id: 19 });
  await act(async () => accept('accepted-event-19'));
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
  expect(uploadPaperlessDocument).toHaveBeenCalledTimes(1);
  expect(vi.mocked(uploadPaperlessDocument).mock.calls[0]?.[0]).toBe(file);
});

it.each(['trips', 'documents'] as const)(
  'hides retained files when the active %s client changes at the same origin, restoring only the original context',
  async (owner) => {
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
      tripsClient: createTripsClient({ baseUrl: 'https://trips.example' }),
      documentsClient: createDocumentsClient({ baseUrl: 'https://documents.example' }),
    };
    const replacement = {
      ...original,
      ...(owner === 'trips'
        ? { tripsClient: createTripsClient({ baseUrl: 'https://trips.example' }) }
        : { documentsClient: createDocumentsClient({ baseUrl: 'https://documents.example' }) }),
    };
    const content = (context: TripDocumentUploadContext) => (
      <QueryClientProvider client={cache}>
        <SourceDocuments {...context} />
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
    const file = new File(['private A'], 'private-a.pdf', { type: 'application/pdf' });
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
    expect(sourceUploadSession(cache, original).read()[0]?.file).toBe(file);
    expect(uploadPaperlessDocument).not.toHaveBeenCalled();
    expect(associatePaperlessDocument).not.toHaveBeenCalled();
  }
);
