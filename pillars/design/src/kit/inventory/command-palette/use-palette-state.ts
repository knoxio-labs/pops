/**
 * The palette's state machine: query, scope and a stack of argument steps
 * (Move, then its target). Arrow keys and the active row belong to cmdk;
 * everything that changes what the palette is asking belongs here.
 */
import { useCallback, useMemo, useReducer } from 'react';

import { buildSections, seeAllResultsEntry } from './palette-groups';

import type { PaletteCommand } from '../shared/contracts';
import type { PaletteScope, PaletteSection, PaletteSource, PaletteStep } from './palette-groups';

/** Query, scope and argument steps. */
export interface PaletteState {
  query: string;
  scope: PaletteScope;
  steps: readonly PaletteStep[];
}

/** A palette with nothing typed, in the Inventory scope. */
export const INITIAL_PALETTE: PaletteState = { query: '', scope: 'inventory', steps: [] };

/** Everything that can change the palette's state. */
export type PaletteAction =
  | { type: 'query'; query: string }
  | { type: 'cycle-scope' }
  | { type: 'push'; command: PaletteCommand }
  | { type: 'pop' }
  | { type: 'reset' };

/** Applies one action. A step clears the query, so the next keystrokes search the step. */
export function paletteReducer(state: PaletteState, action: PaletteAction): PaletteState {
  switch (action.type) {
    case 'query':
      return { ...state, query: action.query };
    case 'cycle-scope':
      if (state.steps.length > 0) return state;
      return { ...state, scope: state.scope === 'inventory' ? 'purchases' : 'inventory' };
    case 'push': {
      const { argument } = action.command;
      if (argument === undefined) return state;
      const step: PaletteStep = {
        commandId: action.command.id,
        label: action.command.label,
        argument,
      };
      return { ...state, query: '', steps: [...state.steps, step] };
    }
    case 'pop':
      return { ...state, steps: state.steps.slice(0, -1) };
    case 'reset':
      return INITIAL_PALETTE;
  }
}

/** What a key does to the palette: the action to apply, and whether the palette should close. */
export interface PaletteKeyOutcome {
  action: PaletteAction | null;
  /** The key belongs to the palette: the browser must not also act on it. */
  handled: boolean;
  close: boolean;
}

/**
 * Keys the palette owns: Backspace on an empty query steps back, Tab
 * switches scope (and never moves focus out, even when a step locks the
 * scope), Esc closes.
 */
export function paletteKey(state: PaletteState, key: string): PaletteKeyOutcome {
  if (key === 'Escape') return { action: null, handled: true, close: true };
  if (key === 'Backspace' && state.query === '' && state.steps.length > 0) {
    return { action: { type: 'pop' }, handled: true, close: false };
  }
  if (key === 'Tab') {
    const action: PaletteAction | null = state.steps.length === 0 ? { type: 'cycle-scope' } : null;
    return { action, handled: true, close: false };
  }
  return { action: null, handled: false, close: false };
}

/** The result of choosing an entry: a step to fill in, or a command to run with its argument. */
export type PaletteChoice =
  | { kind: 'step' }
  | { kind: 'run'; command: PaletteCommand; argument: PaletteCommand | null };

/** Resolves a chosen entry against the current step stack. */
export function choosePaletteEntry(
  state: PaletteState,
  entry: PaletteCommand,
  source: PaletteSource
): PaletteChoice {
  const step = state.steps.at(-1);
  if (step !== undefined) {
    const command = source.commands.find((candidate) => candidate.id === step.commandId) ?? entry;
    return { kind: 'run', command, argument: entry };
  }
  if (entry.argument !== undefined) return { kind: 'step' };
  return { kind: 'run', command: entry, argument: null };
}

/** What {@link usePaletteState} hands the palette component. */
export interface PaletteApi {
  state: PaletteState;
  sections: PaletteSection[];
  step: PaletteStep | null;
  /** The hand-off to the Search page, while a query is searching. */
  seeAll: PaletteCommand | null;
  setQuery: (query: string) => void;
  cycleScope: () => void;
  /** Applies a palette-owned key; `handled` means preventDefault, `close` means dismiss. */
  onKey: (key: string) => { handled: boolean; close: boolean };
  choose: (entry: PaletteCommand) => PaletteChoice;
}

/** The palette's state bound to one source of commands and records. */
export function usePaletteState(
  source: PaletteSource,
  initial: PaletteState = INITIAL_PALETTE
): PaletteApi {
  const [state, dispatch] = useReducer(paletteReducer, initial);
  const step = state.steps.at(-1) ?? null;
  const sections = useMemo(
    () => buildSections(state.query, state.scope, step, source),
    [state.query, state.scope, step, source]
  );
  const onKey = useCallback(
    (key: string) => {
      const outcome = paletteKey(state, key);
      if (outcome.action !== null) dispatch(outcome.action);
      return { handled: outcome.handled, close: outcome.close };
    },
    [state]
  );
  const choose = useCallback(
    (entry: PaletteCommand) => {
      const choice = choosePaletteEntry(state, entry, source);
      if (choice.kind === 'step') dispatch({ type: 'push', command: entry });
      return choice;
    },
    [state, source]
  );
  return {
    state,
    sections,
    step,
    seeAll: seeAllResultsEntry(state.query, state.scope, step),
    setQuery: (query) => dispatch({ type: 'query', query }),
    cycleScope: () => dispatch({ type: 'cycle-scope' }),
    onKey,
    choose,
  };
}
