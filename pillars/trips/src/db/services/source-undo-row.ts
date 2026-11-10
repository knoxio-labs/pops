import { TripsServiceError } from './source-record.js';

/** Require an unchanged owned revision before applying an operation inverse. */
export function guardSourceInverse(
  current: { revision: number },
  after: { revision: number }
): void {
  if (current.revision !== after.revision) throw new TripsServiceError('source_undo_conflict');
}
/** Restore prior source fields with a new revision, or tombstone an operation-created identity. */
export function restoreSourceInverse<T extends { revision: number; removedAt: string | null }>(
  before: T | null,
  after: T
): T & { updatedAt: string } {
  return {
    ...(before ?? after),
    revision: after.revision + 1,
    updatedAt: new Date().toISOString(),
    ...(before === null ? { removedAt: new Date().toISOString() } : {}),
  };
}
