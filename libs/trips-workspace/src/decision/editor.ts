import { ApiError } from '@pops/pillar-sdk/client';

import { DecisionDrafts } from './drafts';
import { isDecisionConflict } from './failure';

import type {
  DecisionEditor,
  DecisionEditorState,
  DecisionFailure,
  DecisionPerformer,
} from './editor-types';
import type { DecisionCommand, DecisionSource, UndoCommand } from './types';

function changedSource(): ApiError {
  return new ApiError({
    code: 'trips.decision.source_changed',
    kind: 'client',
    message: 'The source changed. Reload it and review retained edits before saving again.',
    retryable: false,
  });
}
function commandKey(command: UndoCommand, undo: boolean): string {
  const fields = 'fields' in command ? Object.keys(command.fields).toSorted().join(',') : '';
  return `${undo ? 'undo' : 'edit'}:${command.kind}:${'id' in command ? command.id : ''}:${fields}`;
}

class SourceEditor implements DecisionEditor {
  private state: DecisionEditorState;
  private history: UndoCommand[] = [];
  private pending: DecisionSource | undefined;
  private drafts = new DecisionDrafts();
  private listeners = new Set<() => void>();
  constructor(
    initial: DecisionSource,
    private readonly perform: DecisionPerformer
  ) {
    this.state = {
      source: initial,
      busy: false,
      dirty: false,
      conflict: false,
      undoCount: 0,
      failures: [],
      drafts: {},
    };
  }
  getState = (): DecisionEditorState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  commit(command: DecisionCommand, label: string, assertCurrent?: () => void): Promise<boolean> {
    const failed = this.state.failures.find(
      (failure) => !failure.undo && JSON.stringify(failure.command) === JSON.stringify(command)
    );
    return this.run(command, label, {
      undo: false,
      expectedRevision: failed?.expectedRevision,
      assertCurrent,
    });
  }
  undo(assertCurrent?: () => void): Promise<boolean> {
    const command = this.history.at(-1);
    return command
      ? this.run(command, 'Undo', { undo: true, assertCurrent })
      : Promise.resolve(false);
  }
  retry(failure: DecisionFailure, assertCurrent?: () => void): Promise<boolean> {
    return this.run(failure.command, failure.label, {
      undo: failure.undo,
      expectedRevision: failure.expectedRevision,
      assertCurrent,
    });
  }
  receive(source: DecisionSource): void {
    if (
      source.decision.revision < this.state.source.decision.revision ||
      (this.pending && source.decision.revision < this.pending.decision.revision)
    )
      return;
    if (this.state.busy) {
      this.pending = source;
      return;
    }
    if (source.decision.revision > this.state.source.decision.revision) {
      this.history = [];
      if (this.state.dirty) {
        this.pending = source;
        this.publish({ conflict: true });
        return;
      }
    }
    this.publish({ source, conflict: false });
  }
  reload(source: DecisionSource): void {
    if (source.decision.revision < this.state.source.decision.revision) return;
    const latest =
      this.pending && this.pending.decision.revision > source.decision.revision
        ? this.pending
        : source;
    const changed = latest.decision.revision !== this.state.source.decision.revision;
    if (changed) this.history = [];
    this.pending = undefined;
    this.publish({
      source: latest,
      conflict: false,
      failures: changed
        ? this.state.failures.filter((failure) => !failure.undo)
        : this.state.failures,
    });
  }
  setDirty(key: string, value: boolean): void {
    this.updateDrafts(this.drafts.setDirty(key, value));
  }
  setDraft(key: string, value: string | undefined): void {
    this.updateDrafts(this.drafts.setDraft(key, value));
  }
  private updateDrafts(update: Pick<DecisionEditorState, 'drafts' | 'dirty'>): void {
    this.publish(update);
    if (!update.dirty && this.pending && !this.state.busy) this.flush();
  }
  private publish(update: Partial<DecisionEditorState>): void {
    this.state = { ...this.state, ...update, undoCount: this.history.length };
    for (const listener of this.listeners) listener();
  }
  private failed(
    context: Pick<DecisionFailure, 'command' | 'label' | 'undo' | 'expectedRevision'>,
    error: unknown
  ): void {
    const { command, label, undo, expectedRevision } = context;
    if (isDecisionConflict(error)) this.history = [];
    const key = commandKey(command, undo);
    this.publish({
      busy: false,
      conflict: this.state.conflict || isDecisionConflict(error),
      failures: [
        ...this.state.failures.filter((failure) => failure.key !== key),
        { key, label, error, command, expectedRevision, undo },
      ],
    });
  }
  private flush(): void {
    const source = this.pending;
    this.pending = undefined;
    if (source) this.receive(source);
  }
  private async run(
    command: UndoCommand,
    label: string,
    options: { undo: boolean; expectedRevision?: number; assertCurrent?: () => void }
  ): Promise<boolean> {
    const { undo, expectedRevision = this.state.source.decision.revision, assertCurrent } = options;
    if (this.state.busy) return false;
    if (this.state.conflict || expectedRevision !== this.state.source.decision.revision) {
      this.failed({ command, label, undo, expectedRevision }, changedSource());
      return false;
    }
    const previous = this.state.source;
    const submittedDrafts = this.state.drafts;
    this.publish({ busy: true });
    try {
      assertCurrent?.();
      const result = await this.perform(previous, command, assertCurrent);
      if (
        result.source.decision.revision !== expectedRevision + 1 ||
        result.source.decision.id !== previous.decision.id ||
        result.source.decision.tripId !== previous.decision.tripId
      )
        throw changedSource();
      if (undo) this.history = this.history.slice(0, -1);
      else if (result.inverse) this.history = [...this.history, result.inverse];
      else this.history = [];
      this.publish({
        source: result.source,
        busy: false,
        ...this.drafts.acknowledge(command, previous, submittedDrafts, undo),
        failures: this.state.failures.filter(
          (failure) => failure.key !== commandKey(command, undo)
        ),
      });
      this.flush();
      return true;
    } catch (error) {
      this.failed({ command, label, undo, expectedRevision }, error);
      this.flush();
      return false;
    }
  }
}

/** Create a serialized editor whose inverse requests use only confirmed own successor revisions. */
export function createDecisionEditor(
  initial: DecisionSource,
  perform: DecisionPerformer
): DecisionEditor {
  return new SourceEditor(initial, perform);
}
