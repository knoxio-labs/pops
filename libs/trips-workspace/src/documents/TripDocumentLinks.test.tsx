import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { client as defaultTripsClient } from '../trips-api/client.gen';
import {
  loadDocumentAssociations,
  loadPaperlessDocument,
  loadTripDocumentTargets,
  loadTripRouteVisitIds,
  unlinkPaperlessDocument,
} from './api';
import { TripDocumentLinks } from './TripDocumentLinks';

import type { DocumentAssociationTarget, TripDocumentAssociation } from './types';

vi.mock('./api', () => ({
  loadDocumentAssociations: vi.fn(),
  loadPaperlessDocument: vi.fn(),
  loadTripDocumentTargets: vi.fn(),
  loadTripRouteVisitIds: vi.fn(),
  unlinkPaperlessDocument: vi.fn(),
  paperlessOriginalUrl: (id: number) =>
    `/documents-api/paperless/documents/${String(id)}/download?original=true`,
}));

const loadLinks = vi.mocked(loadDocumentAssociations);
const loadOriginal = vi.mocked(loadPaperlessDocument);
const unlink = vi.mocked(unlinkPaperlessDocument);
const caches: QueryClient[] = [];

beforeEach(() => {
  loadOriginal.mockImplementation(async (id) => ({
    id,
    title: `Original ${String(id)}`,
    originalFileName: 'booking.pdf',
    created: '',
    thumbnailUrl: '',
  }));
});

afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});

function link(
  id: number,
  targetKind: TripDocumentAssociation['targetKind'],
  targetId: number,
  tripId = 4
): TripDocumentAssociation {
  return { id, tripId, documentId: id + 40, targetKind, targetId, createdAt: '' };
}

function mount(target: DocumentAssociationTarget) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  const tree = (selected: DocumentAssociationTarget) => (
    <QueryClientProvider client={cache}>
      <main>
        <h1>Event editor</h1>
        <TripDocumentLinks tripId={4} target={selected} />
      </main>
    </QueryClientProvider>
  );
  const view = render(tree(target));
  return (selected: DocumentAssociationTarget) => view.rerender(tree(selected));
}

describe('TripDocumentLinks scoped editor section', () => {
  it('uses trip, kind and target identity before resolving originals and embeds without a page shell', async () => {
    loadLinks.mockResolvedValue([
      link(1, 'event', 8),
      link(2, 'stay', 8),
      link(3, 'event', 9),
      link(4, 'event', 8, 5),
      link(5, 'trip', 4),
    ]);
    const navigate = mount({ kind: 'event', id: 8 });

    expect(await screen.findByText('Original 41')).toBeVisible();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(
      screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)
    ).toEqual(['Event editor']);
    expect(screen.getByRole('heading', { level: 2, name: 'Documents' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      '/documents-api/paperless/documents/41/download?original=true'
    );
    expect(loadOriginal).toHaveBeenCalledTimes(1);
    expect(loadOriginal).toHaveBeenCalledWith(41, undefined);
    expect(loadTripRouteVisitIds).not.toHaveBeenCalled();
    expect(loadTripDocumentTargets).not.toHaveBeenCalled();

    navigate({ kind: 'stay', id: 8 });
    expect(await screen.findByText('Original 42')).toBeVisible();
    expect(screen.queryByText('Original 41')).not.toBeInTheDocument();
    expect(screen.queryByText('Original 44')).not.toBeInTheDocument();
    expect(loadOriginal).toHaveBeenCalledTimes(2);
  });

  it('keeps an unavailable original removable and deletes only the matching association', async () => {
    let associations = [link(1, 'event', 8), link(2, 'stay', 8)];
    loadLinks.mockImplementation(async () => associations);
    loadOriginal.mockRejectedValue(new Error('missing original'));
    unlink.mockImplementation(async () => {
      associations = associations.filter((association) => association.id !== 1);
    });
    mount({ kind: 'event', id: 8 });

    expect(await screen.findByText('Original unavailable · Documents ID 41')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Open original' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unlink Documents 41' }));
    await waitFor(() => expect(unlink).toHaveBeenCalledWith(4, 1, defaultTripsClient));
    expect(await screen.findByText('No files linked yet.')).toBeVisible();
    expect(associations.map((association) => association.id)).toEqual([2]);
  });

  it('retries source reads and retains a failed unlink without exposing unrelated target links', async () => {
    loadLinks.mockRejectedValueOnce(new Error('source unavailable'));
    loadLinks.mockResolvedValue([link(1, 'event', 8), link(2, 'stay', 8)]);
    unlink.mockRejectedValue(new Error('source rejected unlink'));
    mount({ kind: 'event', id: 8 });

    expect(await screen.findByText('Trip document links could not be loaded.')).toBeVisible();
    expect(screen.queryByText('No files linked yet.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Original 41' }));
    expect(
      await screen.findByText(
        'The Trips link could not be removed. The Documents original was not changed.'
      )
    ).toBeVisible();
    expect(screen.getByText('Original 41')).toBeVisible();
    expect(screen.queryByText('Original 42')).not.toBeInTheDocument();
    expect(unlink).toHaveBeenCalledTimes(1);
  });
});
