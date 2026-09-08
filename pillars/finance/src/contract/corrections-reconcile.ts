/**
 * Fold same-batch references to a still-pending rule (POPS-3158) into the
 * `add` op that mints it, before any pending correction ChangeSet reaches
 * the DB.
 *
 * The rule-manager preview assigns a rule created by an earlier pending
 * `add` a client-only `temp:<n>` id — the same numbering
 * `applyChangeSetToRules` (`corrections-pure.ts`) uses to build that
 * preview. Acting on that rule again before it is committed — editing it,
 * disabling it, removing it — produces an op whose `id` is that `temp:<n>`
 * label. No real row is ever created under that id (a later commit mints a
 * fresh UUID, or merges into an existing rule), so applying such an op
 * against the DB as-is throws `Correction 'temp:<n>' not found`.
 */
import type { ChangeSet, ChangeSetOp } from './rest-corrections-schemas.js';

const TEMP_ID_PATTERN = /^temp:\d+$/;

interface TempAddLocation {
  changeSetIndex: number;
  opIndex: number;
}

type MutableOps = (ChangeSetOp | null)[];

/** Assigns the next `temp:<n>` to each `add` op in `ops`, in order. */
function mintTempIds(
  ops: MutableOps,
  changeSetIndex: number,
  tempIdToLocation: Map<string, TempAddLocation>,
  tempCounter: number
): number {
  for (const [opIndex, op] of ops.entries()) {
    if (op?.op !== 'add') continue;
    tempCounter += 1;
    tempIdToLocation.set(`temp:${tempCounter}`, { changeSetIndex, opIndex });
  }
  return tempCounter;
}

/**
 * Folds `op` into the still-pending `add` it targets, if any. Returns
 * whether it found one — a `temp:<n>` with no known origin (already a bug
 * elsewhere, or a stale label) is left alone; the existing not-found error
 * is the right outcome for a reference this cannot explain.
 */
function foldOpIntoPendingAdd(
  op: Extract<ChangeSetOp, { op: 'edit' | 'disable' | 'remove' }>,
  working: MutableOps[],
  tempIdToLocation: Map<string, TempAddLocation>
): boolean {
  const target = tempIdToLocation.get(op.id);
  if (!target) return false;
  const targetOps = working[target.changeSetIndex];
  const targetOp = targetOps?.[target.opIndex];
  if (!targetOp || targetOp.op !== 'add') return false;

  if (op.op === 'edit') {
    targetOps[target.opIndex] = { ...targetOp, data: { ...targetOp.data, ...op.data } };
  } else if (op.op === 'disable') {
    targetOps[target.opIndex] = { ...targetOp, data: { ...targetOp.data, isActive: false } };
  } else {
    targetOps[target.opIndex] = null;
  }
  return true;
}

/**
 * An `edit` targeting a still-pending rule merges its `data` into that
 * `add`'s `data` and disappears; a `disable` sets that `add`'s
 * `data.isActive = false` and disappears; a `remove` deletes the `add`
 * outright (the rule never existed) and disappears itself.
 */
export function reconcilePendingCorrectionChangeSets(changeSets: ChangeSet[]): ChangeSet[] {
  const working: MutableOps[] = changeSets.map((cs) => [...cs.ops]);
  const tempIdToLocation = new Map<string, TempAddLocation>();
  let tempCounter = 0;

  for (const [changeSetIndex, ops] of working.entries()) {
    tempCounter = mintTempIds(ops, changeSetIndex, tempIdToLocation, tempCounter);

    for (const [opIndex, op] of ops.entries()) {
      if (!op || op.op === 'add' || !TEMP_ID_PATTERN.test(op.id)) continue;
      if (foldOpIntoPendingAdd(op, working, tempIdToLocation)) ops[opIndex] = null;
    }
  }

  return changeSets.map((cs, changeSetIndex) => ({
    ...cs,
    ops: (working[changeSetIndex] ?? []).filter((op): op is ChangeSetOp => op !== null),
  }));
}
