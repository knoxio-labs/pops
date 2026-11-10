import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  associatePaperlessDocument,
  loadDocumentAssociations,
  loadPaperlessDocument,
  loadPaperlessUploadPolicy,
  searchPaperlessDocuments,
  unlinkPaperlessDocument,
} from '../documents/api';
import { sourceDocumentHost } from './source-document-test-utils';

import type { TripDocumentAssociation } from '../documents/types';

vi.mock('../documents/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../documents/api')>()),
  associatePaperlessDocument: vi.fn(),
  loadDocumentAssociations: vi.fn(),
  loadPaperlessDocument: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
  searchPaperlessDocuments: vi.fn(),
  unlinkPaperlessDocument: vi.fn(),
}));

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});
beforeEach(() => {
  vi.mocked(loadPaperlessUploadPolicy).mockResolvedValue({
    available: true,
    configured: true,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
  });
  vi.mocked(loadPaperlessDocument).mockImplementation(async (id) => ({
    id,
    title: `Original ${id}`,
    created: '2029-01-01',
    originalFileName: `${id}.pdf`,
    thumbnailUrl: '',
  }));
  vi.mocked(unlinkPaperlessDocument).mockResolvedValue(undefined);
});
function mount(host: ReturnType<typeof sourceDocumentHost>) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  render(<QueryClientProvider client={cache}>{host.element}</QueryClientProvider>);
}
function association(
  host: ReturnType<typeof sourceDocumentHost>,
  override: Partial<TripDocumentAssociation> = {}
): TripDocumentAssociation {
  return {
    id: 81,
    tripId: 7,
    targetKind: host.target.kind,
    targetId: host.target.id,
    documentId: 91,
    createdAt: '2029-01-01T00:00:00Z',
    ...override,
  };
}

describe.each(['event', 'stay', 'journey'] as const)('%s source documents', (kind) => {
  it('filters the persisted source target, opens the original and removes only its association', async () => {
    const host = sourceDocumentHost(kind);
    vi.mocked(loadDocumentAssociations).mockResolvedValue([
      association(host),
      association(host, { id: 82, documentId: 92, targetKind: 'visit' }),
      association(host, { id: 83, documentId: 93, targetId: host.target.id + 1 }),
      association(host, { id: 84, documentId: 94, tripId: 8 }),
    ]);
    mount(host);
    await screen.findByLabelText(host.label);
    const files = await screen.findByRole('region', { name: 'Source documents' });
    expect(await within(files).findByText('Original 91')).toBeVisible();
    expect(within(files).queryAllByText(/Original 9[234]/)).toHaveLength(0);
    expect(vi.mocked(loadPaperlessDocument).mock.calls.map(([id]) => id)).toEqual([91]);
    expect(within(files).getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      '/documents-api/paperless/documents/91/download?original=true'
    );
    vi.mocked(loadDocumentAssociations).mockResolvedValue([]);
    await userEvent.click(within(files).getByRole('button', { name: 'Unlink Original 91' }));
    await waitFor(() => expect(unlinkPaperlessDocument).toHaveBeenCalledWith(7, 81, host.client));
    expect(host.writes()).toEqual([]);
    expect(loadPaperlessDocument).toHaveBeenCalledWith(91, host.documentsClient);
    expect(loadPaperlessUploadPolicy).toHaveBeenCalledWith(host.documentsClient);
  });

  it('attaches an existing owner original without losing a failed source draft or persisted Undo', async () => {
    const host = sourceDocumentHost(kind, true);
    vi.mocked(loadDocumentAssociations).mockResolvedValue([]);
    vi.mocked(associatePaperlessDocument).mockResolvedValue(association(host));
    vi.mocked(searchPaperlessDocuments).mockResolvedValue([
      {
        id: 91,
        title: 'Owner original',
        created: '2029-01-01',
        originalFileName: 'ticket.pdf',
        thumbnailUrl: '',
      },
    ]);
    mount(host);
    const field = await screen.findByLabelText(host.label);
    fireEvent.change(field, { target: { value: host.next } });
    fireEvent.blur(field);
    await waitFor(() => expect(host.writes()).toHaveLength(1));
    await screen.findByText('Changes have not been saved');
    await userEvent.click(screen.getByRole('button', { name: 'Choose existing document' }));
    await userEvent.type(screen.getByPlaceholderText('Search documents...'), 'ticket');
    await userEvent.click(await screen.findByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(associatePaperlessDocument).toHaveBeenCalledWith(7, 91, host.target, host.client)
    );
    expect(field).toHaveValue(host.next);
    expect(searchPaperlessDocuments).toHaveBeenCalledWith('ticket', host.documentsClient);
    expect(host.writes()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(field).toHaveValue(host.initial));
    expect(host.writes()).toHaveLength(3);
  });

  it('keeps source editing and Undo available when Documents originals and availability fail', async () => {
    const host = sourceDocumentHost(kind);
    vi.mocked(loadDocumentAssociations).mockResolvedValue([association(host)]);
    vi.mocked(loadPaperlessDocument).mockRejectedValue(new Error('Owner unavailable'));
    vi.mocked(loadPaperlessUploadPolicy).mockRejectedValue(new Error('Owner unavailable'));
    mount(host);
    const field = await screen.findByLabelText(host.label);
    expect(await screen.findByText('Original unavailable · Documents ID 91')).toBeVisible();
    fireEvent.change(field, { target: { value: host.next } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(field).toHaveValue(host.initial));
    expect(host.writes()).toHaveLength(2);
  });
});
