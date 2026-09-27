import { isFixtureKind } from './fixture-kinds.js';

import type { FixturesListResponse } from '../../inventory-api/types.gen.js';
import type { FixtureKind } from './fixture-kinds.js';

type FixtureListRow = FixturesListResponse['data'][number];

/** The URL and server filter state for the fixture list. */
export interface FixtureFilter {
  readonly query: string;
  readonly kind: FixtureKind | 'all';
}

/** The filter state that leaves the fixture list un-narrowed. */
export const NO_FIXTURE_FILTER: FixtureFilter = { query: '', kind: 'all' };

/** Returns whether the fixture list is narrowed by either supported filter. */
export function isFiltered(filter: FixtureFilter): boolean {
  return filter.query.trim().length > 0 || filter.kind !== 'all';
}

/** Parses only supported fixture filters, trimming the query for server state. */
export function parseFixtureFilter(params: URLSearchParams): FixtureFilter {
  const kind = params.get('kind');
  return {
    query: (params.get('q') ?? '').trim(),
    kind: kind !== null && isFixtureKind(kind) ? kind : 'all',
  };
}

/** Serialises fixture filters while retaining the query's exact typed text. */
export function fixtureFilterSearch(filter: FixtureFilter): string {
  const params = new URLSearchParams();
  if (filter.query !== '') params.set('q', filter.query);
  if (filter.kind !== 'all') params.set('kind', filter.kind);
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

/** Summarises the server-provided wired item names without inventing rows. */
export function wiredSummary(row: Pick<FixtureListRow, 'wiredCount' | 'wiredNames'>): string {
  if (row.wiredCount === 0) return 'Nothing wired';
  const names = row.wiredNames.slice(0, 2);
  if (names.length === 0) return `${row.wiredCount} wired`;
  if (names.length >= row.wiredCount) return names.join(', ');
  return `${names.join(', ')} and ${row.wiredCount - names.length} more`;
}
