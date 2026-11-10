import { SourceEditSession } from './source-edit-session';
import { useRetainedSession } from './use-retained-session';
import { useSessionView } from './use-session-view';
import { useSourceEditor } from './useSourceEditor';

import type {
  RetainedSessionStore,
  RetainedSourceIdentity,
  RetainedSourceOwner,
} from './retained-session-store';
import type { SourceEditor, SourceEditorOptions } from './source-editor-types';

/** Bind a typed source family to its exact transport and host lifetime, retaining state across view remounts. */
export function useRetainedSourceEditor<Source extends object, Patch extends Partial<Source>>(
  initial: Source,
  store: RetainedSessionStore<SourceEditSession<Source, Patch>>,
  identity: RetainedSourceIdentity,
  options: (owner: RetainedSourceOwner) => SourceEditorOptions<Source, Patch>
): SourceEditor<Source, Patch> {
  const retained = useRetainedSession(
    store,
    identity,
    (owner) => new SourceEditSession(initial, options(owner))
  );
  const view = useSessionView(retained.owner);
  return useSourceEditor(initial, retained.session.context.options, retained.session, view);
}
