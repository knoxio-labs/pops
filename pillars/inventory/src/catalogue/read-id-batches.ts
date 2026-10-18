const SQLITE_READ_BATCH_SIZE = 500;

/** Splits distinct read identities into batches below SQLite's bound-parameter limit. */
export function readIdBatches(ids: readonly string[]): readonly string[][] {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += SQLITE_READ_BATCH_SIZE) {
    batches.push(unique.slice(offset, offset + SQLITE_READ_BATCH_SIZE));
  }
  return batches;
}
