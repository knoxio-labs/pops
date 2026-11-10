import { useLayoutEffect, useSyncExternalStore } from 'react';

import { sameJourney } from './model';

import type { RetainedSourceOwner } from '../shared/retained-session-store';
import type { JourneyChange, JourneySource } from './types';

/** Failed explicit operation retained without replacing its source draft. */
export interface JourneyFailure {
  error: unknown;
  change: JourneyChange;
  undo: boolean;
}
/** Canonical/draft state with serial source history and explicitly retained failure. */
export interface JourneyState {
  saved: JourneySource;
  draft: JourneySource;
  history: JourneyChange[];
  busy: boolean;
  failure: JourneyFailure | undefined;
  dirty: boolean;
}
/** One source session retains both semantic state and its serialization lock across view closure. */
export class JourneyEditSession {
  private readonly listeners = new Set<() => void>();
  private state: JourneyState;
  private observed: JourneySource;
  private canonical: JourneySource;
  private pending: JourneySource | undefined;

  constructor(initial: JourneySource) {
    this.observed = initial;
    this.canonical = initial;
    this.state = {
      saved: initial,
      draft: initial,
      history: [],
      busy: false,
      failure: undefined,
      dirty: false,
    };
  }

  /** Subscribe independently of any particular mounted editor. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read the latest stable snapshot, including state changed by another open view. */
  getState = (): JourneyState => this.state;

  /** Publish one coherent source transition. Busy is also the synchronous serialization lock. */
  update(patch: Partial<Omit<JourneyState, 'dirty'>>): void {
    this.state = { ...this.state, ...patch };
    this.state.dirty = !sameJourney(this.state.saved, this.state.draft);
    for (const listener of this.listeners) listener();
    if (patch.busy === false && this.pending) {
      const pending = this.pending;
      this.pending = undefined;
      this.receive(pending);
    }
  }

  /** Reads retain the monotonic leg aggregate; its revision does not order independent Journey metadata. */
  receive(initial: JourneySource): void {
    if (this.observed === initial) return;
    if (this.state.busy) {
      this.pending = initial;
      return;
    }
    this.observed = initial;
    const canonical = this.withCurrentLegs(initial);
    this.canonical = canonical;
    if (this.state.failure || this.state.dirty) return;
    if (
      this.state.saved.legRevision !== canonical.legRevision ||
      !sameJourney(this.state.saved, canonical)
    )
      this.update({ saved: canonical, draft: canonical, history: [] });
  }

  private withCurrentLegs(initial: JourneySource): JourneySource {
    const current =
      this.canonical.legRevision > this.state.saved.legRevision ? this.canonical : this.state.saved;
    return initial.legRevision < current.legRevision
      ? { ...initial, legs: current.legs, legRevision: current.legRevision }
      : initial;
  }

  /** Explicit discard adopts the latest observed canonical source after a successful owner reload. */
  discard(): void {
    const changed =
      this.state.saved.legRevision !== this.canonical.legRevision ||
      !sameJourney(this.state.saved, this.canonical);
    this.update({
      saved: this.canonical,
      draft: this.canonical,
      failure: undefined,
      ...(changed ? { history: [] } : {}),
    });
  }

  /** A confirmed owned response establishes the observed baseline without borrowing a later read. */
  confirm(source: JourneySource): void {
    this.canonical = source;
  }
}

/** Subscribe to the retained controller and deliver canonical reads after this view commits. */
export function useJourneyState(
  initial: JourneySource,
  session: JourneyEditSession,
  owner: RetainedSourceOwner
): JourneyState {
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  useLayoutEffect(() => {
    if ((owner.client.getConfig().baseUrl ?? '') === owner.origin) session.receive(initial);
  }, [initial, owner, session]);
  return state;
}
