import { eq, and } from 'drizzle-orm';

import { CaptureSchema } from '../../contract/capture-schemas.js';
import { IdeaSchema } from '../../contract/idea-schemas.js';
import { captures, ideas, sourceOperations } from '../schema.js';
import { undoCreatedTargets } from './source-created-target-undo.js';
import { getCapture, getIdea } from './source-queries.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';
import { assertCreatedTargetUnreferenced, assertSourceUnreferenced } from './source-references.js';
import { acknowledgeSourceInverse } from './source-undo-lineage.js';
import { restoreSourceRelations } from './source-undo-relations.js';
import { guardSourceInverse, restoreSourceInverse } from './source-undo-row.js';

import type { SourceCommand } from '../../contract/source-workspace.js';
import type { SourceInverse } from './source-inverse-types.js';
import type { SourceWrite } from './source-write-types.js';

function restoreSources(write: SourceWrite, inverse: SourceInverse): void {
  for (const entry of inverse.captures) {
    guardSourceInverse(getCapture(write.db, write.tripId, entry.after.id), entry.after);
    if (entry.before === null)
      assertSourceUnreferenced(write.db, write.tripId, { kind: 'capture', id: entry.after.id });
    const after = CaptureSchema.parse(
      write.db
        .update(captures)
        .set(restoreSourceInverse(entry.before, entry.after))
        .where(eq(captures.id, entry.after.id))
        .returning()
        .get()
    );
    write.receipt.captures.push(after);
    acknowledgeSourceInverse(write, entry.before, after, (inverse) => inverse.captures);
  }
  for (const entry of inverse.ideas) {
    guardSourceInverse(getIdea(write.db, write.tripId, entry.after.id), entry.after);
    if (entry.before === null)
      assertCreatedTargetUnreferenced(write.db, write.tripId, { kind: 'idea', id: entry.after.id });
    const after = IdeaSchema.parse(
      write.db
        .update(ideas)
        .set(restoreSourceInverse(entry.before, entry.after))
        .where(eq(ideas.id, entry.after.id))
        .returning()
        .get()
    );
    write.receipt.ideas.push(after);
    acknowledgeSourceInverse(write, entry.before, after, (inverse) => inverse.ideas);
  }
  undoCreatedTargets(write, inverse);
}
/** Undo one operation only after all owned preconditions hold; any failure rolls the enclosing transaction back. */
export function undoSourceOperation(
  write: SourceWrite,
  targetOperationId: string,
  allowedKinds: readonly SourceCommand['kind'][]
): void {
  const original = requireOwnedRecord(
    write.db
      .select()
      .from(sourceOperations)
      .where(
        and(
          eq(sourceOperations.tripId, write.tripId),
          eq(sourceOperations.operationId, targetOperationId)
        )
      )
      .get()
  );
  if (
    original.undoneBy !== null ||
    original.request.command.kind === 'undo' ||
    !allowedKinds.includes(original.request.command.kind)
  )
    throw new TripsServiceError('source_undo_conflict');
  try {
    restoreSourceRelations(write, original.inverse);
    restoreSources(write, original.inverse);
  } catch (error) {
    if (
      error instanceof TripsServiceError &&
      (error.code === 'not_found' ||
        error.code === 'source_revision_conflict' ||
        error.code === 'source_referenced')
    )
      throw new TripsServiceError('source_undo_conflict');
    throw error;
  }
  write.db
    .update(sourceOperations)
    .set({ undoneBy: write.receipt.operationId })
    .where(eq(sourceOperations.id, original.id))
    .run();
  write.receipt.undoneOperationId = targetOperationId;
}
