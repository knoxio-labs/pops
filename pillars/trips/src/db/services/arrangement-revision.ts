import { TripsServiceError } from './source-record.js';

/** Check a revision inside the immediate transaction before advancing by exactly one. */
export function requireArrangementRevision(actual: number, expected: number): void {
  if (actual !== expected || !Number.isSafeInteger(actual) || actual >= Number.MAX_SAFE_INTEGER)
    throw new TripsServiceError('arrangement_revision_conflict');
}
