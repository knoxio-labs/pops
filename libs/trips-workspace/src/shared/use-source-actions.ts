import { refreshAfterSave, resetSourceConflicts, sameSourceValue } from './source-refresh';

import type { SourceEditor, SourceEditorOptions, SourceState } from './source-editor-types';

type Actions<Source, Patch> = Pick<
  SourceEditor<Source, Patch>,
  'commit' | 'edit' | 'undo' | 'retry' | 'reset'
>;
/** Mutable session context shared by subscriptions and serialized source actions. */
export interface SourceActionContext<Source, Patch> {
  state: SourceState<Source, Patch>;
  options: SourceEditorOptions<Source, Patch>;
  initial: Source;
  lock: boolean;
  retainedBaseline: Source | undefined;
}

/** Bind actions to one retained session, with a separate permission check for each view. */
export function sourceActions<Source extends object, Patch extends Partial<Source>>(
  context: SourceActionContext<Source, Patch>,
  assertCurrent: () => void = () => {}
): Actions<Source, Patch> {
  return {
    edit: (patch) => {
      assertCurrent();
      editSource(context, patch);
    },
    commit: async (patch, undo = false) => {
      assertCurrent();
      await commitSource(context, patch, undo, assertCurrent);
    },
    reset: () => {
      assertCurrent();
      resetConflicts(context);
    },
    undo: () => {
      assertCurrent();
      const state = context.state;
      if (state.dirty || state.failure) return;
      const previous = state.history.at(-1);
      return (
        previous && commitSource(context, context.options.source(previous), true, assertCurrent)
      );
    },
    retry: () => {
      assertCurrent();
      const failure = context.state.failure;
      return failure && commitSource(context, failure.patch, failure.undo, assertCurrent);
    },
  };
}

function editSource<Source extends object, Patch extends Partial<Source>>(
  context: SourceActionContext<Source, Patch>,
  patch: Patch
): void {
  const draft = { ...context.state.draft, ...patch };
  context.state.setDraft(draft);
  context.state = {
    ...context.state,
    draft,
    dirty: !sameSourceValue(context.options.source(draft), context.state.canonical),
  };
}

async function commitSource<Source extends object, Patch extends Partial<Source>>(
  context: SourceActionContext<Source, Patch>,
  patch: Patch,
  undo: boolean,
  assertCurrent: () => void
): Promise<void> {
  const { state, options, initial: readAtStart } = context;
  if (context.lock || state.conflict) return;
  const pending = state.failure ? { ...state.failure.patch, ...patch } : patch;
  const baseline = state.failure ? (context.retainedBaseline ?? state.saved) : state.saved;
  const next = { ...state.canonical, ...pending };
  if (!state.failure && sameSourceValue(next, state.canonical)) {
    editSource(context, pending);
    state.setFailure(undefined);
    context.state = { ...context.state, failure: undefined };
    context.retainedBaseline = undefined;
    return;
  }
  context.retainedBaseline = baseline;
  context.lock = true;
  state.setBusy(true);
  state.setFailure(undefined);
  editSource(context, pending);
  try {
    assertCurrent();
    const result = await options.save(pending, baseline);
    confirmSource(context, { result, saved: state.saved, pending, readAtStart, undo });
    options.onSaved(result);
  } catch (error) {
    const failure = { patch: pending, undo, error };
    state.setFailure(failure);
    context.state = { ...context.state, failure };
  } finally {
    context.lock = false;
    state.setBusy(false);
  }
}

interface Confirmation<Source, Patch> {
  result: Source;
  saved: Source;
  pending: Patch;
  readAtStart: Source;
  undo: boolean;
}
function confirmSource<Source extends object, Patch extends Partial<Source>>(
  context: SourceActionContext<Source, Patch>,
  { result, saved, pending, readAtStart, undo }: Confirmation<Source, Patch>
): void {
  const { state, options } = context;
  const observed =
    context.initial === readAtStart ? state.canonical : options.source(context.initial);
  const refreshed = refreshAfterSave(
    { baseline: saved, canonical: state.canonical, draft: state.draft, result, observed, pending },
    options.source
  );
  let history = [...state.history, saved];
  if (undo) history = state.history.slice(0, -1);
  if (refreshed.foreign) history = [];
  state.acknowledgeRead(context.initial);
  state.setHistory(history);
  state.setSaved(result);
  state.setCanonical(refreshed.canonical);
  state.setDraft(refreshed.draft);
  state.setConflicts(refreshed.conflicts);
  context.state = {
    ...state,
    saved: result,
    canonical: refreshed.canonical,
    draft: refreshed.draft,
    dirty: !sameSourceValue(options.source(refreshed.draft), refreshed.canonical),
    history,
    failure: undefined,
    conflict: refreshed.conflicts.length > 0,
    conflicts: refreshed.conflicts,
  };
  context.retainedBaseline = undefined;
}

function resetConflicts<Source extends object, Patch extends Partial<Source>>(
  context: SourceActionContext<Source, Patch>
): void {
  if (context.lock) return;
  const { state, options } = context;
  const draft = resetSourceConflicts(state.canonical, state.draft, state.conflicts);
  let failure = state.failure;
  if (failure) {
    const patch = { ...failure.patch };
    for (const key of state.conflicts) delete patch[key];
    failure = Object.keys(patch).length > 0 ? { ...failure, patch } : undefined;
    if (!failure) context.retainedBaseline = undefined;
  }
  state.setDraft(draft);
  state.setFailure(failure);
  state.setConflicts([]);
  state.setHistory([]);
  context.state = {
    ...state,
    draft,
    failure,
    conflicts: [],
    conflict: false,
    history: [],
    dirty: !sameSourceValue(options.source(draft), state.canonical),
  };
}
