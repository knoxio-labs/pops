import { ApiError } from '@pops/pillar-sdk/client';

import type { CaptureHistory } from './editor-types';
import type {
  CaptureSource,
  CaptureResult,
  CaptureRequest,
  CaptureCommand,
  CaptureUndoScope,
} from './types';

/** Select the explicitly published Undo scope for this finite source command. */
export function captureUndoScope(command: CaptureCommand): CaptureUndoScope {
  switch (command.kind) {
    case 'idea.create':
    case 'idea.update':
    case 'idea.remove':
      return 'idea';
    case 'explore.add':
    case 'explore.remove':
      return 'explore';
    default:
      return 'capture';
  }
}
/** Reject a response bound to another request or owning trip before changing session state. */
export function requireCaptureResult(
  result: CaptureResult,
  request: CaptureRequest,
  tripId: number
): void {
  if (
    result.receipt.operationId !== request.operationId ||
    result.receipt.undoneOperationId !==
      ('scope' in request ? request.command.targetOperationId : null) ||
    !sourceBelongsToTrip(result.current, tripId) ||
    !sourceBelongsToTrip(result.receipt, tripId)
  )
    throw new ApiError({
      code: 'trips.capture.response_invalid',
      kind: 'client',
      message: 'The source response did not match this operation. Your draft is retained.',
      retryable: false,
    });
}
/** Validate only explicit ownership, without inventing source fields for an empty workspace. */
export function sourceBelongsToTrip(source: CaptureSource, tripId: number): boolean {
  return [
    ...source.captures,
    ...source.ideas,
    ...source.associations,
    ...source.memberships,
    ...source.events,
    ...source.journeys,
    ...source.stays,
  ].every((row) => row.tripId === tripId);
}
function mergeRows<T extends { id: number }>(before: readonly T[], changed: readonly T[]): T[] {
  const rows = new Map(before.map((row) => [row.id, row]));
  for (const row of changed) rows.set(row.id, row);
  return [...rows.values()];
}
function removeCreated<T extends { id: number }>(
  rows: readonly T[],
  created: readonly { id: number }[]
): T[] {
  const ids = new Set(created.map((row) => row.id));
  return rows.filter((row) => !ids.has(row.id));
}
/** Apply only current affected rows; successful Undo removes only its proven operation-created local targets. */
export function applyCaptureResult(
  source: CaptureSource,
  result: CaptureResult,
  inverse: CaptureHistory | null
): CaptureSource {
  const current = result.current;
  return {
    captures: mergeRows(source.captures, current.captures),
    ideas: mergeRows(source.ideas, current.ideas),
    associations: mergeRows(source.associations, current.associations),
    memberships: mergeRows(source.memberships, current.memberships),
    events: mergeRows(
      inverse ? removeCreated(source.events, inverse.receipt.events) : source.events,
      current.events
    ),
    journeys: mergeRows(
      inverse ? removeCreated(source.journeys, inverse.receipt.journeys) : source.journeys,
      current.journeys
    ),
    stays: mergeRows(
      inverse ? removeCreated(source.stays, inverse.receipt.stays) : source.stays,
      current.stays
    ),
  };
}
