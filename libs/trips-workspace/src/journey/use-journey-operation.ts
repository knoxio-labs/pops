import { useSyncExternalStore } from 'react';

import { RetainedSessionStore } from '../shared/retained-session-store';
import { useRetainedSession } from '../shared/use-retained-session';
import { useSessionView } from '../shared/use-session-view';

import type { RetainedSourceOwner } from '../shared/retained-session-store';
import type { JourneyWorkspaceProps } from './types';
import type { JourneyNavigation } from './use-journey-navigation';

/** Own inverse identity and exact post-write revision, retained for the original trip grouping owner. */
export interface JourneySelectionUndo {
  groupId: number;
  previousSelection: number;
  originalViewed: number;
  postWriteRevision: number;
}

interface OperationState {
  busy: boolean;
  needsReload: boolean;
  failure: { error: unknown; viewed: number } | undefined;
  undo: JourneySelectionUndo | undefined;
}
class JourneyGroupSession {
  private readonly listeners = new Set<() => void>();
  private state: OperationState = {
    busy: false,
    needsReload: false,
    failure: undefined,
    undo: undefined,
  };
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getState = (): OperationState => this.state;
  update(patch: Partial<OperationState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
const sessions = new RetainedSessionStore<JourneyGroupSession>();

/** One serial trip-group action; uncertain writes require a successful canonical reload. */
export interface JourneyOperation {
  busy: boolean;
  needsReload: boolean;
  failure: unknown;
  /** Immutable owner used for requests and cache acknowledgements, including late responses. */
  owner: RetainedSourceOwner;
  /** Confirmed selection inverse; no canonical read may advance this revision. */
  selectionUndo: JourneySelectionUndo | undefined;
  /** Update only confirmed owned selection proof. */
  setSelectionUndo: (undo: JourneySelectionUndo | undefined) => void;
  /** Recheck this view and its actual mutable transport before each dispatch. */
  assertCurrent: () => void;
  reload: (read: () => Promise<boolean>) => Promise<void>;
  run: (operation: () => Promise<void>) => Promise<void>;
}
/** Retain grouping serialization, uncertainty and inverse proof above temporary source views. */
export function useJourneyOperation(
  navigation: JourneyNavigation,
  identity: JourneyWorkspaceProps
): JourneyOperation {
  const { owner, session } = useRetainedSession(
    sessions,
    { ...identity, kind: 'journey-groups', sourceId: 0 },
    () => new JourneyGroupSession()
  );
  const view = useSessionView(owner);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  return {
    busy: state.busy,
    needsReload: state.needsReload,
    failure: state.failure?.viewed === navigation.viewed ? state.failure.error : undefined,
    owner,
    selectionUndo: state.undo,
    setSelectionUndo: (undo): void => session.update({ undo }),
    assertCurrent: (): void => view.assertCurrent(),
    reload: async (read): Promise<void> => {
      if (!view.isActive() || session.getState().busy) return;
      try {
        view.assertCurrent();
        session.update({ busy: true });
        if (await read()) session.update({ needsReload: false, failure: undefined });
      } catch (error) {
        session.update({ failure: { error, viewed: navigation.viewed } });
      } finally {
        session.update({ busy: false });
      }
    },
    run: async (operation): Promise<void> => {
      if (!view.isActive() || session.getState().busy || session.getState().needsReload) return;
      try {
        view.assertCurrent();
        session.update({ busy: true });
        await operation();
      } catch (error) {
        session.update({
          needsReload: true,
          failure: { error, viewed: navigation.viewed },
        });
      } finally {
        session.update({ busy: false });
      }
    },
  };
}
