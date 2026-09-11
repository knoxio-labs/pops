/**
 * Chunking for SQLite `IN (...)` predicates fed a caller-sized id list.
 *
 * better-sqlite3 binds one SQL parameter per `inArray(...)` element, and
 * SQLite refuses to prepare a statement past `SQLITE_MAX_VARIABLE_NUMBER`
 * bound parameters (32766 on the builds this pillar ships with). A list that
 * scales with order history rather than with a page or a single order's rows
 * — the sweep's charge-scoped queries, in particular — can cross that
 * ceiling; this splits it into chunks small enough that no single statement
 * ever approaches the cap.
 */

/**
 * Comfortably under `SQLITE_MAX_VARIABLE_NUMBER` (32766) so a query that
 * pairs a chunk of ids with a handful of other bound parameters — a status
 * equality, a date range — never approaches the cap even on its last,
 * partial chunk.
 */
export const SQLITE_IN_CHUNK_SIZE = 4000;

/** Split `ids` into chunks of at most `size`. Empty input yields no chunks. */
export function chunkIds<T>(ids: readonly T[], size: number = SQLITE_IN_CHUNK_SIZE): T[][] {
  if (size <= 0) throw new Error(`chunkIds: size must be positive, got ${size}`);
  if (ids.length === 0) return [];

  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Run a read `query` once per chunk of `ids` and concatenate the results.
 *
 * Order across chunk boundaries is unspecified — a caller that needs a
 * particular order sorts the concatenated result itself. Empty input makes
 * no query at all.
 */
export function queryChunked<Id, Row>(
  ids: readonly Id[],
  query: (chunk: readonly Id[]) => readonly Row[],
  size: number = SQLITE_IN_CHUNK_SIZE
): Row[] {
  const result: Row[] = [];
  for (const chunk of chunkIds(ids, size)) {
    result.push(...query(chunk));
  }
  return result;
}

/**
 * Run a write `mutate` once per chunk of `ids` and sum the row counts it
 * reports. Empty input makes no query and returns 0.
 */
export function mutateChunked<Id>(
  ids: readonly Id[],
  mutate: (chunk: readonly Id[]) => number,
  size: number = SQLITE_IN_CHUNK_SIZE
): number {
  let total = 0;
  for (const chunk of chunkIds(ids, size)) {
    total += mutate(chunk);
  }
  return total;
}
