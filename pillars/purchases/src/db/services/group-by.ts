/**
 * Index rows by a key, for the read path's one-query-per-collection joins.
 *
 * Shared because both the item and charge reads fan a flat result set back
 * into per-parent lists, and duplicating it once was already one time too
 * many.
 */
export function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket === undefined) out.set(k, [row]);
    else bucket.push(row);
  }
  return out;
}
