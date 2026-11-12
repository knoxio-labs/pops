import { ApiError } from '@pops/pillar-sdk/client';

import { emptyCaptureDraft } from './draft';
import { sourceBelongsToTrip } from './result';
import { CaptureRevisionRecovery } from './revision-recovery';
import { CaptureSelectionStore } from './selection-store';

import type { CaptureEditorState, CaptureHistory, CaptureIntent } from './editor-types';
import type { CapturePerformer, CaptureSource } from './types';

/** Internal shared session state; source reads carry the mutation generation at which they started. */
export class CaptureEditorStore {
  state: CaptureEditorState;
  history: CaptureHistory[] = [];
  pending: CaptureIntent | null = null;
  failureIntent: CaptureIntent | null = null;
  selections = new CaptureSelectionStore();
  readonly recovery: CaptureRevisionRecovery;
  private listeners = new Set<() => void>();
  private queued: { source: CaptureSource; generation: number } | null = null;
  constructor(
    initial: CaptureSource,
    readonly tripId: number,
    public perform: CapturePerformer,
    readonly newId: () => string
  ) {
    if (!sourceBelongsToTrip(initial, tripId))
      throw new ApiError({
        code: 'trips.capture.context_invalid',
        kind: 'client',
        message: 'The source belongs to another trip.',
        retryable: false,
      });
    this.state = {
      source: initial,
      draft: emptyCaptureDraft(),
      draftRevision: 0,
      generation: 0,
      busy: false,
      composerLocked: false,
      undoCount: 0,
      failure: null,
      confirmation: null,
    };
    this.recovery = new CaptureRevisionRecovery(this);
  }
  /** Notify all mounted views of one atomic session-state update. */
  publish(update: Partial<CaptureEditorState>): void {
    this.state = { ...this.state, ...update, undoCount: this.history.length };
    for (const listener of this.listeners) listener();
  }
  /** Subscribe without creating another draft or operation history. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Ignore reads started before a confirmed own mutation and defer reads while a request is in flight. */
  receive(source: CaptureSource, generation: number): void {
    if (generation !== this.state.generation || !sourceBelongsToTrip(source, this.tripId)) return;
    if (this.state.busy) this.queued = { source, generation };
    else {
      this.recovery.acceptedRead();
      this.publish({ source });
    }
  }
  /** Apply a queued read only if no confirmed mutation superseded its original generation. */
  flush(): void {
    const queued = this.queued;
    this.queued = null;
    if (queued !== null) this.receive(queued.source, queued.generation);
  }
}
