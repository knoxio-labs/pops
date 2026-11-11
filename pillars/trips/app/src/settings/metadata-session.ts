import { cacheMetadata, metadataSource, persistMetadata } from './metadata-persistence';
import { draftInput, tripDraft } from './model';

import type { RetainedSourceOwner } from '@pops/trips-workspace';

import type { Trip } from '../api/types';
import type { MetadataInvocation, MetadataState } from './metadata-types';
import type { TripDraft } from './model';

/** One retained instance of the metadata save/Undo engine; plain PATCH supplies no server CAS or UUID deduplication. */
export class MetadataSession {
  private state: MetadataState;
  private readonly listeners = new Set<() => void>();
  private invocation: MetadataInvocation | undefined;
  private epoch = 0;

  constructor(
    readonly owner: RetainedSourceOwner,
    initial: Trip
  ) {
    const saved = metadataSource(initial, owner.tripId);
    this.state = { saved, draft: tripDraft(saved), history: [], busy: false, failure: undefined };
  }

  /** A read dispatched before a local transition cannot replace a later saved source. */
  get generation(): number {
    return this.epoch;
  }
  /** Stable until an editor transition occurs. */
  snapshot = (): MetadataState => this.state;
  /** View disposal releases its subscription, not this retained controller or dispatched write. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Preserve dirty/failure state; independently changed clean canonical reads invalidate own inverse history. */
  receive(source: Trip): void {
    if (this.state.busy || this.state.failure || this.dirty()) return;
    const saved = metadataSource(source, this.owner.tripId);
    if (JSON.stringify(saved) === JSON.stringify(this.state.saved)) return;
    this.epoch += 1;
    this.publish({ ...this.state, saved, draft: tripDraft(saved), history: [] });
  }
  /** Local fields retain opaque When text and do not alter a failed invocation. */
  change(draft: TripDraft): void {
    if (!this.state.busy) this.publish({ ...this.state, draft: structuredClone(draft) });
  }
  /** Unresolved failed writes require their exact retry or an explicit local discard. */
  save = (): Promise<void> => (this.state.failure ? Promise.resolve() : this.persist());
  /** Only this session's confirmed inverse stack is eligible for Undo. */
  undo = (): Promise<void> => {
    const previous = this.state.history.at(-1);
    return previous && !this.dirty() && !this.state.failure
      ? this.persist(previous)
      : Promise.resolve();
  };
  /** Repeat the retained body, including an unknown server-committed write, without claiming deduplication. */
  retry = (): Promise<void> =>
    this.invocation ? this.persist(this.invocation.undo, this.invocation) : Promise.resolve();
  /** Abandon the local draft and failed invocation against the last confirmed source. */
  discard(): void {
    if (this.state.busy) return;
    this.epoch += 1;
    this.invocation = undefined;
    this.publish({ ...this.state, draft: tripDraft(this.state.saved), failure: undefined });
  }
  private dirty(): boolean {
    return JSON.stringify(this.state.draft) !== JSON.stringify(tripDraft(this.state.saved));
  }
  private async persist(undo?: Trip, retained?: MetadataInvocation): Promise<void> {
    if (this.state.busy) return;
    const invocation =
      retained ??
      Object.freeze({
        before: structuredClone(this.state.saved),
        draft: structuredClone(this.state.draft),
        undo,
        body: Object.freeze(
          draftInput(undo ? tripDraft(undo) : this.state.draft, tripDraft(this.state.saved))
        ),
      });
    this.invocation = invocation;
    this.epoch += 1;
    this.publish({ ...this.state, busy: true, failure: undefined });
    try {
      const saved = await persistMetadata(this.owner, invocation.body);
      this.epoch += 1;
      cacheMetadata(this.owner, saved);
      const unchanged = JSON.stringify(this.state.draft) === JSON.stringify(invocation.draft);
      this.invocation = undefined;
      this.publish({
        saved,
        draft: unchanged ? tripDraft(saved) : this.state.draft,
        history: undo
          ? this.state.history.slice(0, -1)
          : [...this.state.history, invocation.before],
        busy: false,
        failure: undefined,
      });
    } catch (error) {
      this.epoch += 1;
      this.publish({ ...this.state, busy: false, failure: { error, undo: invocation.undo } });
    }
  }
  private publish(state: MetadataState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
