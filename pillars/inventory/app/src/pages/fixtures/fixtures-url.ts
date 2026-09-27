import { isFixtureKind, type FixtureKind } from './fixture-kinds.js';

/** URL-backed state for the fixture list filters. */
export interface FixturesUrlState {
  readonly q: string;
  readonly kind: FixtureKind | null;
}

/** Parses supported fixture filters from the current route query. */
export function parseFixturesUrl(params: URLSearchParams): FixturesUrlState {
  const q = params.get('q') ?? '';
  const kindValue = params.get('kind');
  return {
    q,
    kind: kindValue !== null && isFixtureKind(kindValue) ? kindValue : null,
  };
}

/** Writes fixture filters while preserving unrelated query parameters. */
export function writeFixturesUrl(
  current: URLSearchParams,
  patch: Partial<FixturesUrlState>
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (patch.q !== undefined) {
    const query = patch.q.trim();
    if (query === '') next.delete('q');
    else next.set('q', query);
  }
  if (patch.kind !== undefined) {
    if (patch.kind === null) next.delete('kind');
    else next.set('kind', patch.kind);
  }
  return next;
}
