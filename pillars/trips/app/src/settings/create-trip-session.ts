import { assertTripCreationOwner } from './create-trip-owner';
import { creationWasRejected, persistTripCreation } from './create-trip-persistence';
import { sameCreationDraft } from './create-trip-types';
import { draftInput, tripDraft } from './model';

import type { TripCreateResult } from '../api/types';
import type { TripCreationOwner } from './create-trip-owner';
import type { TripCreationAttempt, TripCreationState } from './create-trip-types';
import type { TripDraft } from './model';

/** One creation controller survives view closure and cache eviction; creation is permanent and has no Undo. */
export class TripCreationSession {
  private state: TripCreationState = {
    draft: Object.freeze(tripDraft()),
    submitted: undefined,
    busy: false,
    locked: false,
    error: undefined,
    confirmed: false,
  };
  private readonly listeners = new Set<() => void>();
  private attempt: TripCreationAttempt | undefined;
  private acknowledgement: TripCreateResult | undefined;
  private delivered = false;
  private rejected = false;
  private generation = 0;

  constructor(readonly owner: TripCreationOwner) {}

  /** Snapshots are stable until a controller transition, independently of mounted views. */
  snapshot = (): TripCreationState => this.state;

  /** Unsubscribing never forgets a submitted command or its eventual acknowledgement. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Later edits are retained separately; they never rewrite the immutable submitted attempt. */
  change(draft: TripDraft): void {
    assertTripCreationOwner(this.owner);
    this.generation += 1;
    if (this.rejected) {
      this.attempt = undefined;
      this.rejected = false;
    }
    this.publish({
      ...this.state,
      draft: Object.freeze({ ...draft }),
      ...(!this.attempt && { submitted: undefined, error: undefined }),
    });
  }

  /** Allocate a new UUID only for an explicit new intent, never for an unresolved command. */
  create = (): Promise<void> => {
    if (this.state.busy || this.state.confirmed || (this.attempt && !this.rejected))
      return Promise.resolve();
    assertTripCreationOwner(this.owner);
    const draft = Object.freeze({ ...this.state.draft });
    this.attempt = Object.freeze({
      request: Object.freeze({
        operationId: crypto.randomUUID(),
        command: Object.freeze({ kind: 'trip.create', input: Object.freeze(draftInput(draft)) }),
      }),
      draft,
      generation: this.generation,
    });
    return this.persist(this.attempt);
  };

  /** Explicit Retry uses the retained UUID and body even after closure, failure or a newer local draft. */
  retry = (): Promise<void> =>
    this.attempt &&
    !this.state.confirmed &&
    (!this.rejected || sameCreationDraft(this.state.draft, this.attempt.draft))
      ? this.persist(this.attempt)
      : Promise.resolve();

  /** Cancel clears only an unsubmitted or definitely rejected draft; unresolved commands survive hiding. */
  cancel(): void {
    assertTripCreationOwner(this.owner);
    if (this.attempt && !this.rejected) return;
    this.attempt = undefined;
    this.rejected = false;
    this.generation += 1;
    this.publish({
      ...this.state,
      draft: Object.freeze(tripDraft()),
      submitted: undefined,
      error: undefined,
    });
  }

  /** Claim a validated result once across views; do not wipe a draft edited after this submission. */
  takeConfirmation(): TripCreateResult | undefined {
    assertTripCreationOwner(this.owner);
    if (!this.acknowledgement || this.delivered) return undefined;
    this.delivered = true;
    const result = this.acknowledgement;
    const draft =
      this.generation === this.attempt?.generation ? Object.freeze(tripDraft()) : this.state.draft;
    this.attempt = undefined;
    this.publish({ ...this.state, draft, submitted: undefined, locked: false, confirmed: false });
    return result;
  }

  private async persist(attempt: TripCreationAttempt): Promise<void> {
    if (this.state.busy) return;
    this.rejected = false;
    this.publish({
      ...this.state,
      busy: true,
      locked: true,
      submitted: attempt.draft,
      error: undefined,
    });
    try {
      this.acknowledgement = await persistTripCreation(this.owner, attempt.request);
      this.delivered = false;
      this.publish({ ...this.state, busy: false, confirmed: true });
    } catch (error) {
      this.rejected = creationWasRejected(error);
      this.publish({ ...this.state, busy: false, locked: !this.rejected, error });
    }
  }

  private publish(state: TripCreationState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
