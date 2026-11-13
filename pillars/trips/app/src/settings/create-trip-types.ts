import type { TripCreateRequest } from '../api/types';
import type { TripDraft } from './model';

/** An immutable attempt is independent of any later local draft. */
export interface TripCreationAttempt {
  readonly request: TripCreateRequest;
  readonly draft: TripDraft;
  readonly generation: number;
}

/** Stable observable state; an unresolved attempt displays its submitted fields during recovery. */
export interface TripCreationState {
  readonly draft: TripDraft;
  readonly submitted: TripDraft | undefined;
  readonly busy: boolean;
  readonly locked: boolean;
  readonly error: unknown;
  readonly confirmed: boolean;
}

/** Retry must describe the fields currently displayed, including verbatim opaque planning text. */
export function sameCreationDraft(left: TripDraft, right: TripDraft): boolean {
  const fields = ['name', 'destination', 'when', 'tagId', 'parentId', 'notes'] as const;
  return fields.every((field) => left[field] === right[field]);
}
