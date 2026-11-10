import { useLayoutEffect, useRef } from 'react';

import { refreshAfterSave, resetSourceConflicts, sameSourceValue } from './source-refresh';

import type { SourceEditor, SourceEditorOptions, SourceState } from './source-editor-types';

type Actions<Source, Patch> = Pick<
  SourceEditor<Source, Patch>,
  'commit' | 'edit' | 'undo' | 'retry' | 'reset'
>;
interface Context<Source, Patch> {
  state: SourceState<Source, Patch>;
  options: SourceEditorOptions<Source, Patch>;
  initial: Source;
  lock: boolean;
  retainedBaseline: Source | undefined;
}

/** Bind source actions to the latest rendered state while retaining each failed write's confirmed baseline. */
export function useSourceActions<Source extends object, Patch extends Partial<Source>>(
  state: SourceState<Source, Patch>,
  options: SourceEditorOptions<Source, Patch>,
  initial: Source
): Actions<Source, Patch> {
  const context = useRef<Context<Source, Patch>>({
    state,
    options,
    initial,
    lock: false,
    retainedBaseline: undefined,
  });
  useLayoutEffect(() => {
    context.current.state = state;
    context.current.options = options;
    context.current.initial = initial;
  });
  return {
    edit: (patch) => editSource(context.current, patch),
    commit: (patch, undo = false) => commitSource(context.current, patch, undo),
    reset: () => resetConflicts(context.current),
    undo: () => {
      const state = context.current.state;
      if (state.dirty || state.failure) return;
      const previous = state.history.at(-1);
      return (
        previous && commitSource(context.current, context.current.options.source(previous), true)
      );
    },
    retry: () => {
      const failure = context.current.state.failure;
      return failure && commitSource(context.current, failure.patch, failure.undo);
    },
  };
}

function editSource<Source extends object, Patch extends Partial<Source>>(
  context: Context<Source, Patch>,
  patch: Patch
): void {
  const draft = { ...context.state.draft, ...patch };
  context.state.setDraft(draft);
  context.state = {
    ...context.state,
    draft,
    dirty: !sameSourceValue(
      context.options.source(draft),
      context.options.source(context.state.saved)
    ),
  };
}

async function commitSource<Source extends object, Patch extends Partial<Source>>(
  context: Context<Source, Patch>,
  patch: Patch,
  undo: boolean
): Promise<void> {
  const { state, options, initial: readAtStart } = context;
  if (context.lock || state.conflict) return;
  const pending = state.failure ? { ...state.failure.patch, ...patch } : patch;
  const baseline = state.failure ? (context.retainedBaseline ?? state.saved) : state.saved;
  const next = { ...state.saved, ...pending };
  if (!state.failure && sameSourceValue(options.source(next), options.source(state.saved))) {
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
  context: Context<Source, Patch>,
  { result, saved, pending, readAtStart, undo }: Confirmation<Source, Patch>
): void {
  const { state, options } = context;
  const observed = context.initial === readAtStart ? saved : context.initial;
  const refreshed = refreshAfterSave(
    { baseline: saved, draft: state.draft, result, observed, pending },
    options.source
  );
  let history = [...state.history, saved];
  if (undo) history = state.history.slice(0, -1);
  if (refreshed.foreign) history = [];
  state.acknowledgeRead(context.initial);
  state.setHistory(history);
  state.setSaved(result);
  state.setDraft(refreshed.draft);
  state.setConflicts(refreshed.conflicts);
  context.state = {
    ...state,
    saved: result,
    draft: refreshed.draft,
    dirty: !sameSourceValue(options.source(refreshed.draft), options.source(result)),
    history,
    failure: undefined,
    conflict: refreshed.conflicts.length > 0,
    conflicts: refreshed.conflicts,
  };
  context.retainedBaseline = undefined;
}

function resetConflicts<Source extends object, Patch extends Partial<Source>>(
  context: Context<Source, Patch>
): void {
  if (context.lock) return;
  const { state, options } = context;
  const draft = resetSourceConflicts(state.saved, state.draft, state.conflicts, options.source);
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
    dirty: !sameSourceValue(options.source(draft), options.source(state.saved)),
  };
}
