import { and, eq, isNull } from 'drizzle-orm';

import { sourceOperations } from '../schema.js';
import { canonicalSourceValue } from './source-canonical.js';
import { TripsServiceError } from './source-record.js';

import type { SourceInverse } from './source-inverse-types.js';
import type { SourceWrite } from './source-write-types.js';

type InverseRow<T> = { before: T | null; after: T };

/** Advance only a proven active predecessor after this transaction restores its exact prior snapshot. */
export function acknowledgeSourceInverse<T>(
  write: SourceWrite,
  before: T | null,
  after: T,
  rows: (inverse: SourceInverse) => InverseRow<T>[]
): void {
  if (before === null) return;
  const expected = canonicalSourceValue(before);
  const matches = write.db
    .select()
    .from(sourceOperations)
    .where(and(eq(sourceOperations.tripId, write.tripId), isNull(sourceOperations.undoneBy)))
    .all()
    .flatMap((operation) =>
      rows(operation.inverse)
        .filter((entry) => canonicalSourceValue(entry.after) === expected)
        .map((entry) => ({ operation, entry }))
    );
  if (matches.length > 1) throw new TripsServiceError('source_undo_conflict');
  const predecessor = matches[0];
  if (predecessor === undefined) return;
  predecessor.entry.after = after;
  write.db
    .update(sourceOperations)
    .set({ inverse: predecessor.operation.inverse })
    .where(eq(sourceOperations.id, predecessor.operation.id))
    .run();
}
