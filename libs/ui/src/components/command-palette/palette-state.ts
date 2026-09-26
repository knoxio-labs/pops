import { useCallback, useMemo, useReducer } from 'react';

import type {
  PaletteAction,
  PaletteApi,
  PaletteChoice,
  PaletteCommand,
  PaletteKeyOutcome,
  PaletteSource,
  PaletteState,
} from './types';

/** Creates the initial state for a palette scope. */
export function initialPaletteState(scope: string): PaletteState {
  return { query: '', scope, steps: [] };
}

/** Applies one state transition owned by the palette. */
export function paletteReducer(state: PaletteState, action: PaletteAction): PaletteState {
  switch (action.type) {
    case 'query':
      return { ...state, query: action.query };
    case 'cycle-scope': {
      if (state.steps.length > 0 || action.scopes.length < 2) return state;
      const currentIndex = action.scopes.indexOf(state.scope);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % action.scopes.length;
      return { ...state, scope: action.scopes[nextIndex] ?? state.scope };
    }
    case 'push': {
      if (action.command.argument === undefined) return state;
      return {
        ...state,
        query: '',
        steps: [
          ...state.steps,
          {
            commandId: action.command.id,
            label: action.command.label,
            argument: action.command.argument,
          },
        ],
      };
    }
    case 'pop':
      return { ...state, steps: state.steps.slice(0, -1) };
    case 'reset':
      return initialPaletteState(action.scope);
  }
}

/** Resolves a key into a state action and whether the palette owns it. */
export function paletteKey(
  state: PaletteState,
  key: string,
  scopes: readonly string[]
): PaletteKeyOutcome {
  if (key === 'Escape') return { action: null, handled: true, close: true };
  if (key === 'Backspace' && state.query === '' && state.steps.length > 0) {
    return { action: { type: 'pop' }, handled: true, close: false };
  }
  if (key === 'Tab') {
    const action =
      state.steps.length === 0 && scopes.length > 1
        ? { type: 'cycle-scope' as const, scopes }
        : null;
    return { action, handled: true, close: false };
  }
  return { action: null, handled: false, close: false };
}

/** Resolves an entry against the current argument step, if one is open. */
export function choosePaletteEntry<C extends PaletteCommand>(
  state: PaletteState,
  entry: C,
  commands: readonly C[]
): PaletteChoice<C> {
  const step = state.steps.at(-1);
  if (step !== undefined) {
    const command = commands.find((candidate) => candidate.id === step.commandId) ?? entry;
    return { kind: 'run', command, argument: entry };
  }
  if (entry.argument !== undefined) return { kind: 'step' };
  return { kind: 'run', command: entry, argument: null };
}

/** Binds a palette source to its query, scope and argument-step state machine. */
export function usePaletteState<C extends PaletteCommand>(
  source: PaletteSource<C>,
  initial: PaletteState = initialPaletteState(source.scopes[0]?.id ?? '')
): PaletteApi<C> {
  const [state, dispatch] = useReducer(paletteReducer, initial);
  const step = state.steps.at(-1) ?? null;
  const derived = useMemo(() => {
    const sections = source.sections(state.query, state.scope, step);
    const seeAll = source.seeAll?.(state.query, state.scope, step) ?? null;
    const status = source.status?.(state.query, state.scope, step) ?? 'ready';
    return { sections, seeAll, status };
  }, [source, state.query, state.scope, step]);
  const onKey = useCallback(
    (key: string) => {
      const outcome = paletteKey(
        state,
        key,
        source.scopes.map((scope) => scope.id)
      );
      if (outcome.action !== null) dispatch(outcome.action);
      return { handled: outcome.handled, close: outcome.close };
    },
    [source.scopes, state]
  );
  const choose = useCallback(
    (entry: C) => {
      const choice = choosePaletteEntry(state, entry, source.commands);
      if (choice.kind === 'step') dispatch({ type: 'push', command: entry });
      return choice;
    },
    [source.commands, state]
  );
  return {
    state,
    sections: derived.sections,
    step,
    seeAll: derived.seeAll,
    status: derived.status,
    setQuery: (query) => dispatch({ type: 'query', query }),
    cycleScope: () =>
      dispatch({
        type: 'cycle-scope',
        scopes: source.scopes.map((scope) => scope.id),
      }),
    onKey,
    choose,
  };
}
