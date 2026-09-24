import type { MockHandler, MockRequest } from '@pops/pillar-sdk/testing/api-mock';

/**
 * The few answer shapes every handler set here repeats.
 *
 * The type parameter is the operation's generated success body, so a fixture
 * handed to `ok<AccountsListResponses[200]>(…)` is checked against the
 * contract it is standing in for.
 */

export const ok =
  <T>(body: T): MockHandler =>
  () => ({ body });

export const created =
  <T>(body: T): MockHandler =>
  () => ({ status: 201, body });

export const noContent: MockHandler = () => ({ status: 204 });

/** `{ message }`, finance's and contacts' answer for a write with nothing else to report. */
export const done: MockHandler = () => ({ body: { message: 'ok' } });

/** `{ ok: true }`, purchases' answer for the same. */
export const acknowledged: MockHandler = () => ({ body: { ok: true } });

export function notFound(what: string) {
  return { status: 404, body: { code: 'NOT_FOUND', message: `No such ${what}` } };
}

function intParam(query: URLSearchParams, name: string, fallback: number): number {
  const raw = Number(query.get(name));
  return Number.isInteger(raw) && raw >= 0 && query.has(name) ? raw : fallback;
}

/**
 * One page of `rows`, honouring `limit`/`offset` the way the pillars do, with
 * the pagination block the paged list operations share. Honoured rather than
 * ignored because `fetchAllPages` loops until `hasMore` is false: a mock that
 * always answered `hasMore: true` would hang it, and one that ignored `offset`
 * would duplicate every row.
 */
export function page<T>(rows: readonly T[], request: MockRequest) {
  const limit = intParam(request.query, 'limit', 50);
  const offset = intParam(request.query, 'offset', 0);
  const data = rows.slice(offset, offset + limit);
  return {
    data,
    pagination: { total: rows.length, limit, offset, hasMore: offset + data.length < rows.length },
  };
}
