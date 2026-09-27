import type { ContainerAccess } from '../../../foundation/model/model.js';

/** The phases of the container unpack flow. */
export type UnpackPhase =
  | 'browse'
  | 'unpacking'
  | 'closed-partial'
  | 'emptied'
  | 'confirm-retire'
  | 'kept'
  | 'retired';

/** The placement action used to remove a thing from a container. */
export type ExitKind = 'take-out' | 'move' | 'pick-up';

/** The local unpack state, including the optimistic direct-content list. */
export interface UnpackState {
  phase: UnpackPhase;
  access: ContainerAccess;
  inside: readonly string[];
  out: readonly { id: string; how: ExitKind | 'lifecycle' }[];
}

/** Actions accepted by {@link unpackReducer}. */
export type UnpackAction =
  | { type: 'start' }
  | { type: 'sync'; ids: readonly string[] }
  | { type: 'exit'; ids: readonly string[]; how: ExitKind }
  | { type: 'restore'; ids: readonly string[] }
  | { type: 'remove'; ids: readonly string[]; how: 'lifecycle' }
  | { type: 'finish' }
  | { type: 'close' }
  | { type: 'open' }
  | { type: 'keep' }
  | { type: 'ask-retire' }
  | { type: 'cancel-retire' }
  | { type: 'retire' }
  | { type: 'retire-failed' }
  | { type: 'restore-retired' };

/** Creates the initial browse state for the current direct contents. */
export function initialUnpack(inside: readonly string[], access: ContainerAccess): UnpackState {
  return { phase: 'browse', access, inside: [...inside], out: [] };
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

function sync(state: UnpackState, ids: readonly string[]): UnpackState {
  const known = new Set([...state.inside, ...state.out.map((entry) => entry.id)]);
  const additions = ids.filter((id) => !known.has(id));
  if (additions.length === 0) return state;
  const phase = state.phase === 'emptied' ? 'unpacking' : state.phase;
  return { ...state, inside: [...state.inside, ...additions], phase };
}

function restore(state: UnpackState, ids: readonly string[]): UnpackState {
  const returning = new Set(ids.filter((id) => state.out.some((entry) => entry.id === id)));
  if (returning.size === 0) return state;
  const inside = [
    ...state.inside,
    ...state.out.filter((entry) => returning.has(entry.id)).map((entry) => entry.id),
  ];
  const out = state.out.filter((entry) => !returning.has(entry.id));
  const phase =
    state.phase === 'emptied' || state.phase === 'confirm-retire' ? 'unpacking' : state.phase;
  return { ...state, inside, out, phase };
}

function remove(state: UnpackState, ids: readonly string[], how: 'lifecycle'): UnpackState {
  const removed = new Set(ids);
  if (removed.size === 0) return state;
  const leaving = new Set(state.inside.filter((id) => removed.has(id)));
  const inside = state.inside.filter((id) => !leaving.has(id));
  if (inside.length === state.inside.length) return state;
  const emptied = inside.length === 0 && state.phase === 'unpacking';
  const out = [...state.out, ...[...leaving].map((id) => ({ id, how }))];
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
  'retire-failed': ['retired', 'confirm-retire'],
  'restore-retired': ['retired', 'emptied'],
};

/** Applies one valid unpack transition and ignores actions outside its phase. */
export function unpackReducer(state: UnpackState, action: UnpackAction): UnpackState {
  switch (action.type) {
    case 'start':
      return start(state);
    case 'sync':
      return sync(state, action.ids);
    case 'exit':
      return exit(state, action.ids, action.how);
    case 'restore':
      return restore(state, action.ids);
    case 'remove':
      return remove(state, action.ids, action.how);
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

/** Returns the number of direct contents already removed and the original total. */
export function unpackProgress(state: UnpackState): { out: number; total: number } {
  return { out: state.out.length, total: state.out.length + state.inside.length };
}

/** Explains why content exits are currently unavailable, or returns null when allowed. */
export function exitRefusal(state: UnpackState, name: string): string | null {
  if (state.access === 'closed') return `${name} is closed. Open it to take things out.`;
  if (state.inside.length === 0) return `${name} is empty.`;
  return null;
}
