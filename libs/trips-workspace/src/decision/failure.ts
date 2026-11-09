import { ApiError } from '@pops/pillar-sdk/client';

/** Only a confirmed revision mismatch invalidates the editor's known inverse history. */
export function isDecisionConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'trips.decision.decision_revision_conflict' ||
      error.code === 'trips.decision.source_changed')
  );
}
