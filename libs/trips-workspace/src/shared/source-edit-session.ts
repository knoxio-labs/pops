import { refreshSource, sameSourceValue } from './source-refresh';
import { sourceActions } from './use-source-actions';

import type { SetStateAction } from 'react';

import type { SourceEditorOptions, SourceState } from './source-editor-types';
import type { SourceActionContext } from './use-source-actions';

/** One observable direct-edit controller owns drafts, failed baselines, serialization and inverse history. */
export class SourceEditSession<Source extends object, Patch extends Partial<Source>> {
  private readonly listeners = new Set<() => void>();
  private observed: Source;
  readonly context: SourceActionContext<Source, Patch>;

  constructor(initial: Source, options: SourceEditorOptions<Source, Patch>) {
    this.observed = initial;
    const state: SourceState<Source, Patch> = {
      saved: initial,
      canonical: options.source(initial),
      draft: initial,
      history: [],
      busy: false,
      failure: undefined,
      dirty: false,
      conflict: false,
      conflicts: [],
      setSaved: (value) => this.set('saved', value),
      setCanonical: (value) => this.set('canonical', value),
      setDraft: (value) => this.set('draft', value),
      setHistory: (value) => this.set('history', value),
      setBusy: (value) => this.set('busy', value),
      setFailure: (value) => this.set('failure', value),
      setConflicts: (value) => this.set('conflicts', value),
      acknowledgeRead: (value) => {
        this.observed = typeof value === 'function' ? value(this.observed) : value;
      },
    };
    this.context = { state, options, initial, lock: false, retainedBaseline: undefined };
  }

  /** Subscribe without tying controller lifetime to any particular mounted view. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable snapshot until a source transition occurs. */
  getState = (): SourceState<Source, Patch> => this.context.state;

  /** Local editors may update their persistence binding; retained editors keep their captured owner binding. */
  bind(options: SourceEditorOptions<Source, Patch>): void {
    this.context.options = options;
  }

  /** Observe a canonical read without replacing pending edits or acknowledging another writer's inverse. */
  receive(initial: Source): void {
    this.context.initial = initial;
    const state = this.context.state;
    if (this.observed === initial || state.busy) return;
    this.observed = initial;
    if (sameSourceValue(initial, state.saved)) return;
    const source = this.context.options.source;
    const refreshed = refreshSource(
      { canonical: state.canonical, draft: state.draft, initial, failed: state.failure?.patch },
      source
    );
    this.context.state = {
      ...state,
      saved: initial,
      canonical: source(initial),
      draft: refreshed.draft,
      history: [],
      conflicts: [...new Set([...state.conflicts, ...refreshed.conflicts])],
    };
    this.publish();
  }

  /** Each view supplies its own dispatch permission; an in-flight write remains owned by this session. */
  actions(assertCurrent?: () => void): ReturnType<typeof sourceActions<Source, Patch>> {
    return sourceActions(this.context, assertCurrent);
  }

  private set<Key extends keyof SourceState<Source, Patch>>(
    key: Key,
    value: SetStateAction<SourceState<Source, Patch>[Key]>
  ): void {
    const previous = this.context.state[key];
    const next =
      typeof value === 'function'
        ? (value as (previous: SourceState<Source, Patch>[Key]) => SourceState<Source, Patch>[Key])(
            previous
          )
        : value;
    if (Object.is(previous, next)) return;
    this.context.state = { ...this.context.state, [key]: next };
    this.publish();
    if (key === 'busy' && next === false) this.receive(this.context.initial);
  }

  private publish(): void {
    const state = this.context.state;
    this.context.state = {
      ...state,
      dirty: !sameSourceValue(this.context.options.source(state.draft), state.canonical),
      conflict: state.conflicts.length > 0,
    };
    for (const listener of this.listeners) listener();
  }
}
