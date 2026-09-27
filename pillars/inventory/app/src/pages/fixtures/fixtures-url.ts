import { fixtureFilterSearch, parseFixtureFilter } from './fixture-filter.js';

import type { FixtureKind } from './fixture-kinds.js';

/** The legacy URL shape kept for consumers of the fixture page model. */
export interface FixturesUrlState {
  readonly q: string;
  readonly kind: FixtureKind | null;
}

/** Parses fixture URL state with a trimmed query and a nullable kind. */
export function parseFixturesUrl(params: URLSearchParams): FixturesUrlState {
  const parsed = parseFixtureFilter(params);
  return { q: parsed.query, kind: parsed.kind === 'all' ? null : parsed.kind };
}

/** Writes fixture URL state without trimming the typed query. */
export function writeFixturesUrl(
  current: URLSearchParams,
  patch: Partial<FixturesUrlState>
): URLSearchParams {
  const existing = parseFixturesUrl(current);
  const query = patch.q ?? current.get('q') ?? '';
  const kind = patch.kind === undefined ? existing.kind : patch.kind;
  const next = new URLSearchParams(current);
  next.delete('q');
  next.delete('kind');
  const encoded = fixtureFilterSearch({ query, kind: kind ?? 'all' });
  for (const [key, value] of new URLSearchParams(encoded.slice(1))) next.set(key, value);
  return next;
}
