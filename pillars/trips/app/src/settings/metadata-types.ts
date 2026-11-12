import type { Trip, TripInput } from '../api/types';
import type { TripDraft } from './model';

/** Failed or unknown metadata persistence retains its original inverse target. */
export interface MetadataFailure {
  error: unknown;
  undo?: Trip;
}
/** Stable observable state of the existing metadata editor. */
export interface MetadataState {
  saved: Trip;
  draft: TripDraft;
  history: readonly Trip[];
  busy: boolean;
  failure: MetadataFailure | undefined;
}
/** One immutable plain-PATCH invocation; retries do not reconstruct it from a later draft. */
export interface MetadataInvocation {
  readonly body: TripInput;
  readonly before: Trip;
  readonly draft: TripDraft;
  readonly undo?: Trip;
}
