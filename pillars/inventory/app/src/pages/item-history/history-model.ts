import { HISTORY_KIND_GROUPS } from '@pops/inventory';

/** The event families available on the item history page. */
export type HistoryFilter = 'all' | 'placement' | 'details' | 'lifecycle';

/** The filter chips in their display order. */
export const HISTORY_FILTERS: readonly HistoryFilter[] = [
  'all',
  'placement',
  'details',
  'lifecycle',
];

/** The visible label for each item history filter. */
export const HISTORY_FILTER_LABELS: Readonly<Record<HistoryFilter, string>> = {
  all: 'All',
  placement: 'Where it went',
  details: 'Details',
  lifecycle: 'Lifecycle',
};

/** Parses the URL kind parameter, defaulting unknown values to all events. */
export function parseHistoryFilter(value: string | null): HistoryFilter {
  return value === 'placement' || value === 'details' || value === 'lifecycle' ? value : 'all';
}

/** Returns the server event kinds for one history filter; all leaves the query unfiltered. */
export function historyKinds(filter: HistoryFilter): readonly string[] | undefined {
  return filter === 'all' ? undefined : HISTORY_KIND_GROUPS[filter];
}

function countKinds(kinds: readonly string[], counts: Readonly<Record<string, number>>): number {
  return kinds.reduce((total, kind) => total + (counts[kind] ?? 0), 0);
}

/** Converts the server's per-kind counts into the four history chip counts. */
export function chipCounts(
  kindCounts: Readonly<Record<string, number>>,
  total: number
): Record<HistoryFilter, number> {
  const counts: Record<HistoryFilter, number> = {
    all: total,
    placement: countKinds(HISTORY_KIND_GROUPS.placement, kindCounts),
    details: countKinds(HISTORY_KIND_GROUPS.details, kindCounts),
    lifecycle: countKinds(HISTORY_KIND_GROUPS.lifecycle, kindCounts),
  };
  return counts;
}
