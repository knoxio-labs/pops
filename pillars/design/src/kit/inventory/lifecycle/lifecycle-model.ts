/**
 * Which lifecycle acts an item can take, what each asks for, and what its
 * button says. Destroyed is terminal; every other act is reversible, so it
 * collects a reason and then offers Undo rather than asking twice. Split and
 * change quantity guard the no-zero-quantity rule before the server has to.
 */
import type { InventoryConcept, Lifecycle } from '../foundation';

/** One lifecycle act. `restore` returns a retired, discarded or lost item to active. */
export type LifecycleAct = 'retire' | 'lost' | 'discard' | 'destroy' | 'restore';

/** The acts offered from each lifecycle, in menu order. Destroy is always last. */
const ACTS: Readonly<Record<Lifecycle, readonly LifecycleAct[]>> = {
  active: ['retire', 'lost', 'discard', 'destroy'],
  retired: ['restore', 'discard', 'destroy'],
  discarded: ['restore', 'destroy'],
  lost: ['restore', 'discard'],
  destroyed: [],
};

/** The acts an item in this lifecycle can take. */
export function lifecycleActs(lifecycle: Lifecycle): readonly LifecycleAct[] {
  return ACTS[lifecycle];
}

/** Whether an act can be undone from its toast. Only destroy cannot. */
export function isReversible(act: LifecycleAct): boolean {
  return act !== 'destroy';
}

interface ActCopy {
  verb: string;
  concept: InventoryConcept;
  /** The presets a reason field offers; the last is always free text. */
  reasons: readonly string[];
  reasonRequired: boolean;
}

const COPY: Readonly<Record<LifecycleAct, ActCopy>> = {
  retire: {
    verb: 'Retire',
    concept: 'retired',
    reasons: ['No longer used', 'Replaced', 'Kept for parts', 'Other'],
    reasonRequired: false,
  },
  lost: {
    verb: 'Mark lost',
    concept: 'lost',
    reasons: ['Not where it should be', 'Left somewhere', 'Other'],
    reasonRequired: false,
  },
  discard: {
    verb: 'Discard',
    concept: 'discarded',
    reasons: ['Broken', 'Gave away', 'Sold', 'Thrown out', 'Other'],
    reasonRequired: true,
  },
  destroy: {
    verb: 'Destroy',
    concept: 'destroyed',
    reasons: ['Recycled', 'Broken beyond repair', 'Other'],
    reasonRequired: false,
  },
  restore: { verb: 'Restore', concept: 'undo', reasons: [], reasonRequired: false },
};

/** The copy for one act: its verb, icon concept and reason presets. */
export function actCopy(act: LifecycleAct): ActCopy {
  return COPY[act];
}

/** What the restore verb is called for where the item is now. Lost comes back as found. */
export function restoreLabel(lifecycle: Lifecycle): string {
  return lifecycle === 'lost' ? 'Found it' : 'Restore';
}

/**
 * The confirm button: the verb and exactly what it acts on, so the button
 * predicts the outcome. One item is named; several are counted.
 */
export function confirmLabel(act: LifecycleAct, subject: string | number): string {
  const verb = COPY[act].verb;
  if (typeof subject === 'string') return `${verb} ${subject}`;
  return `${verb} ${subject} ${subject === 1 ? 'item' : 'items'}`;
}

/** Whether a chosen reason lets the act go ahead. `Other` needs its text. */
export function reasonReady(act: LifecycleAct, preset: string | null, text: string): boolean {
  if (preset === null) return !COPY[act].reasonRequired;
  if (preset === 'Other') return text.trim().length > 0;
  return true;
}

/** Why a split cannot go ahead, or null when it can. */
export function splitProblem(quantity: number, splitOff: number): string | null {
  if (quantity < 2) return 'Only a group of two or more can be split.';
  if (!Number.isInteger(splitOff) || splitOff < 1) return 'Split off at least 1.';
  if (splitOff >= quantity) {
    return `Split off at most ${quantity - 1}, so at least 1 stays here.`;
  }
  return null;
}

/** Why a new quantity cannot be saved, or null when it can. */
export function quantityProblem(
  current: number,
  next: number,
  isContainer: boolean
): string | null {
  if (isContainer) return 'A container is always one thing.';
  if (!Number.isInteger(next)) return 'Use a whole number.';
  if (next < 1) return 'At least 1. To get rid of all of them, discard the item.';
  if (next === current) return 'That is the current quantity.';
  return null;
}
