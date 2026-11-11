import { RetainedSessionStore } from '../shared/retained-session-store';
import { useRetainedSession } from '../shared/use-retained-session';
import { applyDecisionCommand, decisionQueryKey } from './api';
import { createDecisionEditor } from './editor';

import type { RetainedSession, SourceSessionView } from '../shared/retained-session-store';
import type { DecisionEditor } from './editor-types';
import type { DecisionSource, DecisionWorkspaceProps } from './types';

const sessions = new RetainedSessionStore<DecisionEditor>();

/** Retain the existing controller with a permanently captured transport and cache key. */
export function useRetainedDecisionEditor(
  initial: DecisionSource,
  props: DecisionWorkspaceProps
): RetainedSession<DecisionEditor> {
  return useRetainedSession(
    sessions,
    { ...props, kind: 'decision', sourceId: props.decisionId },
    (owner) => {
      const cache = owner.scope;
      const identity = { client: owner.client, tripId: owner.tripId, decisionId: owner.sourceId };
      const queryKey = decisionQueryKey(identity);
      return createDecisionEditor(initial, async (source, command, assertCurrent) => {
        assertCurrent?.();
        await cache.cancelQueries({ queryKey });
        assertCurrent?.();
        try {
          const result = await applyDecisionCommand(identity, source, command);
          cache.setQueryData(queryKey, result.source);
          return result;
        } finally {
          void cache.invalidateQueries({ queryKey });
        }
      });
    }
  );
}

/** Bind only this view's action permission; other mounted views retain their independent leases. */
export function bindDecisionEditor(
  session: DecisionEditor,
  view: SourceSessionView
): DecisionEditor {
  return {
    getState: session.getState,
    subscribe: session.subscribe,
    commit: (command, label) =>
      view.isActive()
        ? session.commit(command, label, () => view.assertCurrent())
        : Promise.resolve(false),
    undo: () =>
      view.isActive() ? session.undo(() => view.assertCurrent()) : Promise.resolve(false),
    retry: (failure) =>
      view.isActive() ? session.retry(failure, () => view.assertCurrent()) : Promise.resolve(false),
    receive: (source) => {
      if (view.isCurrent()) {
        session.receive(source);
      }
    },
    reload: (source) => {
      if (view.isCurrent()) {
        session.reload(source);
      }
    },
    setDirty: (key, dirty) => {
      if (view.isCurrent()) {
        session.setDirty(key, dirty);
      }
    },
    setDraft: (key, value) => {
      if (view.isCurrent()) {
        session.setDraft(key, value);
      }
    },
  };
}
