import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { applyDecisionCommand, decisionQueryKey } from './api';
import { createDecisionEditor } from './editor';

import type { DecisionEditorState, DecisionEditor, DecisionPerformer } from './editor-types';
import type { DecisionSource, DecisionWorkspaceProps } from './types';

/** Bind source persistence to the current transport without rebasing Undo on query refresh. */
export function useDecisionEditor(
  initial: DecisionSource,
  props: DecisionWorkspaceProps
): { editor: DecisionEditor; state: DecisionEditorState } {
  const cache = useQueryClient();
  const perform = useCallback<DecisionPerformer>(
    async (source, command) => {
      const activeCache = cache;
      const identity = props;
      const queryKey = decisionQueryKey(identity);
      await activeCache.cancelQueries({ queryKey });
      try {
        const result = await applyDecisionCommand(identity, source, command);
        activeCache.setQueryData(queryKey, result.source);
        return result;
      } finally {
        void activeCache.invalidateQueries({ queryKey });
      }
    },
    [cache, props]
  );
  const [editor] = useState(() => createDecisionEditor(initial, perform));
  useEffect(() => {
    editor.setPerformer(perform);
  }, [editor, perform]);
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  useEffect(() => {
    editor.receive(initial);
  }, [editor, initial]);
  return { editor, state };
}
