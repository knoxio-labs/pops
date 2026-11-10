import { ApiError } from '@pops/pillar-sdk/client';

import type { MeetingOperation, MeetingPlan, MeetingResult } from './types';

/** Stable state of serialized source mutations, retained failures and confirmed own Undo. */
export interface PeopleEditorSnapshot {
  readonly plans: MeetingPlan[];
  readonly busy: boolean;
  readonly failure: { operation: MeetingOperation; error: unknown } | null;
  readonly canUndo: boolean;
}
/** Revision-guarded meeting editor; retries never manufacture a new create or borrow a foreign revision. */
export class PeopleEditor {
  private state: PeopleEditorSnapshot;
  private history: MeetingResult['receipt'][] = [];
  private listeners = new Set<() => void>();
  private dirty = new Set<string>();

  constructor(
    initial: MeetingPlan[],
    private apply: (operation: MeetingOperation) => Promise<MeetingResult>
  ) {
    this.state = { plans: initial, busy: false, failure: null, canUndo: false };
  }

  /** Subscribe to a stable immutable editor snapshot. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read the current source, exact failed operation, and inverse availability. */
  snapshot = (): PeopleEditorSnapshot => this.state;

  private publish(patch: Partial<PeopleEditorSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.state = {
      ...this.state,
      canUndo:
        this.history.length > 0 && !this.state.busy && !this.state.failure && this.dirty.size === 0,
    };
    for (const listener of this.listeners) listener();
  }

  /** Observe a canonical reload; uncertain commands stay fenced until explicitly retried. */
  refresh = (plans: MeetingPlan[]): void => {
    if (this.state.busy || this.state.failure || this.dirty.size > 0) return;
    const changed = this.state.plans.some((plan) => {
      const incoming = plans.find((entry) => entry.id === plan.id);
      return incoming ? incoming.revision !== plan.revision : !plan.removed;
    });
    if (changed) this.history = [];
    this.publish({ plans });
  };

  /** Dirty fields retain their observed source revision until save or explicit discard. */
  setDirty = (key: string, dirty: boolean): void => {
    if (dirty) this.dirty.add(key);
    else this.dirty.delete(key);
    this.publish({});
  };

  /** Explicitly discard a definitively rejected command after a successful canonical read; uncertain writes stay fenced. */
  reload = (plans: MeetingPlan[]): void => {
    const error = this.state.failure?.error;
    if (
      this.state.busy ||
      (error &&
        !(
          error instanceof ApiError &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500
        ))
    )
      return;
    this.history = [];
    this.publish({ plans, failure: null });
  };

  /** Submit a new explicit command once; pending or failed operations prevent another write. */
  run = async (command: MeetingOperation['command']): Promise<void> => {
    if (this.state.busy || this.state.failure) return;
    await this.submit({ operationId: crypto.randomUUID(), command });
  };

  /** Retry the identical idempotent operation after a failed or ambiguous response. */
  retry = async (): Promise<void> => {
    if (!this.state.busy && this.state.failure) await this.submit(this.state.failure.operation);
  };

  /** Undo the newest confirmed own operation; the producer validates its untouched outcome. */
  undo = async (): Promise<void> => {
    const prior = this.history.at(-1);
    if (prior && this.state.canUndo)
      await this.run({ kind: 'undo', targetOperationId: prior.operationId });
  };

  private async submit(operation: MeetingOperation): Promise<void> {
    this.publish({ busy: true, failure: null });
    try {
      const result = await this.apply(operation);
      const exists = this.state.plans.some((plan) => plan.id === result.current.id);
      const plans = this.state.plans.map((plan) =>
        plan.id === result.current.id ? result.current : plan
      );
      if (!exists) plans.push(result.current);
      const confirmed = !result.undone && result.current.revision === result.receipt.after.revision;
      if (operation.command.kind === 'undo') this.history.pop();
      else if (confirmed) this.history.push(result.receipt);
      if (!confirmed) this.history = [];
      this.publish({ plans, failure: null });
    } catch (error) {
      if (
        error instanceof ApiError &&
        [
          'trips.meeting_plan.meeting_revision_conflict',
          'trips.meeting_plan.meeting_undo_conflict',
        ].includes(error.code)
      ) {
        this.history = [];
      }
      this.publish({ failure: { operation, error } });
    } finally {
      this.publish({ busy: false });
    }
  }
}
