/**
 * The unpacking flow of one container (iOS parity #3): things leave by
 * Take out (to where the container sits), Move or Pick up; the last one out
 * asks what becomes of the empty container (keep it or retire it); closing
 * with things still inside pauses the unpack rather than ending it. A closed
 * container refuses every way out until it is opened.
 */
import type { ContainerAccess } from '../foundation';

/** Where the flow is. `closed-partial` is paused, not finished. */
export type UnpackPhase =
  | 'browse'
  | 'unpacking'
  | 'closed-partial'
  | 'emptied'
  | 'confirm-retire'
  | 'kept'
  | 'retired';

/** How one thing left the container. */
export type ExitKind = 'take-out' | 'move' | 'pick-up';

/** The flow's state: what is still directly inside, in list order, and what left. */
export interface UnpackState {
  phase: UnpackPhase;
  access: ContainerAccess;
  inside: readonly string[];
  out: readonly { id: string; how: ExitKind }[];
}

/** Everything that can happen to the flow. */
export type UnpackAction =
  | { type: 'start' }
  | { type: 'exit'; ids: readonly string[]; how: ExitKind }
  | { type: 'finish' }
  | { type: 'close' }
  | { type: 'open' }
  | { type: 'keep' }
  | { type: 'ask-retire' }
  | { type: 'cancel-retire' }
  | { type: 'retire' };

/** A container at rest with these contents. */
export function initialUnpack(inside: readonly string[], access: ContainerAccess): UnpackState {
  return { phase: 'browse', access, inside, out: [] };
}

function exit(state: UnpackState, ids: readonly string[], how: ExitKind): UnpackState {
  if (state.access === 'closed') return state;
  const leaving = new Set(ids.filter((id) => state.inside.includes(id)));
  if (leaving.size === 0) return state;
  const inside = state.inside.filter((id) => !leaving.has(id));
  const out = [...state.out, ...[...leaving].map((id) => ({ id, how }))];
  const emptied = inside.length === 0 && state.phase === 'unpacking';
  return { ...state, inside, out, phase: emptied ? 'emptied' : state.phase };
}

function close(state: UnpackState): UnpackState {
  if (state.access === 'closed') return state;
  const paused = state.phase === 'unpacking' && state.inside.length > 0;
  return { ...state, access: 'closed', phase: paused ? 'closed-partial' : state.phase };
}

function open(state: UnpackState): UnpackState {
  if (state.access === 'open') return state;
  const resumed = state.phase === 'closed-partial' ? 'unpacking' : state.phase;
  return { ...state, access: 'open', phase: resumed };
}

function start(state: UnpackState): UnpackState {
  if (state.access === 'closed' || state.phase !== 'browse') return state;
  return { ...state, phase: state.inside.length === 0 ? 'emptied' : 'unpacking' };
}

const OUTCOME: Partial<Record<UnpackAction['type'], [UnpackPhase, UnpackPhase]>> = {
  finish: ['unpacking', 'browse'],
  keep: ['emptied', 'kept'],
  'ask-retire': ['emptied', 'confirm-retire'],
  'cancel-retire': ['confirm-retire', 'emptied'],
  retire: ['confirm-retire', 'retired'],
};

/** The flow's reducer. Actions that do not apply in the current phase change nothing. */
export function unpackReducer(state: UnpackState, action: UnpackAction): UnpackState {
  switch (action.type) {
    case 'start':
      return start(state);
    case 'exit':
      return exit(state, action.ids, action.how);
    case 'close':
      return close(state);
    case 'open':
      return open(state);
    default: {
      const step = OUTCOME[action.type];
      if (step === undefined || state.phase !== step[0]) return state;
      return { ...state, phase: step[1] };
    }
  }
}

/** Progress for the unpacking strip: how many are out of how many there were. */
export function unpackProgress(state: UnpackState): { out: number; total: number } {
  return { out: state.out.length, total: state.out.length + state.inside.length };
}

/** Why nothing can leave right now, or null when things can. */
export function exitRefusal(state: UnpackState, name: string): string | null {
  if (state.access === 'closed') return `${name} is closed. Open it to take things out.`;
  if (state.inside.length === 0) return `${name} is empty.`;
  return null;
}
