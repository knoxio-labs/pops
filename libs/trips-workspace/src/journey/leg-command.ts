import { ApiError } from '@pops/pillar-sdk/client';

import type { JourneyChange, JourneyCommand, JourneySource } from './types';

/** Pin one removal identity and its exact source revision before sending, retaining both unchanged for retries. */
export function prepareJourneyChange(source: JourneySource, change: JourneyChange): JourneyCommand {
  if (change.kind === 'journey') return change;
  const expectedRevision = change.expectedRevision ?? source.legRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw new ApiError({
      code: 'trips.journey_leg.source_invalid',
      kind: 'client',
      message: 'Reload a versioned leg source before editing.',
      retryable: true,
    });
  if (change.kind === 'remove')
    return { ...change, expectedRevision, operationId: change.operationId ?? crypto.randomUUID() };
  return { ...change, expectedRevision };
}
/** Confirmed stale source preconditions invalidate inverse history; transient errors retain their original command. */
export function legConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'trips.journey_leg.leg_revision_conflict' ||
      error.code === 'trips.journey_leg.leg_order_conflict')
  );
}
