import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useSessionView } from '../shared/use-session-view';
import { bindDecisionEditor, useRetainedDecisionEditor } from './retained-editor';

import type { DecisionEditorState, DecisionEditor } from './editor-types';
import type { DecisionSource, DecisionWorkspaceProps } from './types';

/** Bind a mounted view to its retained source controller and immutable transport/cache owner. */
export function useDecisionEditor(
  initial: DecisionSource,
  props: DecisionWorkspaceProps
): { editor: DecisionEditor; state: DecisionEditorState } {
  const retained = useRetainedDecisionEditor(initial, props);
  const session = retained.session;
  const view = useSessionView(retained.owner);
  const editor = useMemo(() => bindDecisionEditor(session, view), [session, view]);
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  useEffect(() => {
    editor.receive(initial);
  }, [editor, initial]);
  return { editor, state };
}
