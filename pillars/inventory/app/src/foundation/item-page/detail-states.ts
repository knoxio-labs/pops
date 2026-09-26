/** The render states that can occur before the detail aggregate is ready. */
export type DetailViewState = 'loading' | 'error' | 'not-found' | 'ready';

import type { DetailSectionCounts, DetailSectionSummary } from './detail-types';

/** Chooses the stable page state from the current query result. */
export function detailViewState({
  hasId,
  isLoading,
  hasItem,
  isNotFound,
  hasError,
}: {
  hasId: boolean;
  isLoading: boolean;
  hasItem: boolean;
  isNotFound: boolean;
  hasError: boolean;
}): DetailViewState {
  if (!hasId || isNotFound) return 'not-found';
  if (isLoading && !hasItem) return 'loading';
  if (hasError && !hasItem) return 'error';
  return hasItem ? 'ready' : 'error';
}

function documentSummary(counts: DetailSectionCounts): string {
  if (counts.paperless === 'unreachable') return 'Paperless is unavailable';
  if (counts.paperless === 'not-configured') return 'Paperless is not connected';
  if (counts.documentCount === 0) return 'No documents linked';
  return `${counts.documentCount} document${counts.documentCount === 1 ? '' : 's'}`;
}

function countSummary(count: number, noun: string, empty: string): string {
  if (count === 0) return empty;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Summarizes sections for tabs, counts, and the one-line empty/error copy. */
export function buildDetailSectionSummaries(counts: DetailSectionCounts): DetailSectionSummary[] {
  return [
    {
      id: 'provenance',
      label: 'Provenance',
      count: null,
      summary: counts.hasProvenance ? 'Purchase details recorded' : 'No purchase details recorded',
      flagged: false,
    },
    {
      id: 'documents',
      label: 'Documents',
      count: counts.documentCount,
      summary: documentSummary(counts),
      flagged: counts.paperless !== 'connected',
    },
    {
      id: 'connections',
      label: 'Connections',
      count: counts.connectionCount,
      summary: countSummary(counts.connectionCount, 'connection', 'Not connected to anything'),
      flagged: false,
    },
    {
      id: 'history',
      label: 'History',
      count: counts.historyCount,
      summary: countSummary(counts.historyCount, 'event', 'Nothing recorded yet'),
      flagged: false,
    },
  ];
}
