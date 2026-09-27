import { showUndoToast } from '../../../foundation/feedback/undo-toast.js';
import { refusalReason } from '../../item-detail/detail-action-helpers.js';

import type { BulkItemRefusal, BulkResult } from '../../../inventory-web/item-verbs-bulk.js';
import type { VerbResult } from '../../../inventory-web/item-verbs.js';
import type { RepairCase } from '../sync-model.js';
import type { AppliedRepair, RepairOutcome } from './repair-outcome.js';

type SetOutcome = (outcome: RepairOutcome | null) => void;

/** Records an applied web verb and keeps its existing Undo offer functional. */
export function showAppliedResult(
  result: Extract<VerbResult, { status: 'applied' }>,
  message: string,
  concept: 'code' | 'item',
  setOutcome: SetOutcome
): void {
  if (result.undo !== null) {
    const undo = result.undo;
    showUndoToast({
      concept,
      message,
      onUndo: async () => {
        await undo();
        setOutcome(null);
      },
    });
  }
  setOutcome({ kind: 'applied', message, at: new Date().toISOString() });
}

/** Converts a refused verb into the repair sheet's existing refusal notice. */
export function showVerbResult(
  result: VerbResult,
  message: string,
  setRefusal: (message: string | null) => void,
  setOutcome: SetOutcome
): void {
  if (result.status === 'refused') {
    setRefusal(`Not saved. ${refusalReason(result.refusal)}`);
    return;
  }
  showAppliedResult(result, message, 'item', setOutcome);
}

function isVerbRefusal(
  refusal: BulkItemRefusal
): refusal is Exclude<BulkItemRefusal, { kind: 'no-previous-place' }> {
  return refusal.kind === 'outcome' || refusal.kind === 'failed';
}

/** Records the single-item result returned by a typed bulk type replacement. */
export function showBulkTypeResult(input: {
  result: BulkResult;
  repair: RepairCase;
  replacement: string;
  setRefusal: (message: string | null) => void;
  setOutcome: (outcome: RepairOutcome | null) => void;
  onApplied: ((applied: AppliedRepair) => void) | undefined;
}): void {
  const refused = input.result.refused.find(({ id }) => id === input.repair.itemId);
  if (refused !== undefined) {
    const reason = isVerbRefusal(refused.refusal)
      ? refusalReason(refused.refusal)
      : 'The inventory service refused this change.';
    input.setRefusal(`Not saved. ${reason}`);
    return;
  }
  if (!input.result.applied.includes(input.repair.itemId)) return;
  const message = `Changed type to ${input.replacement}`;
  if (input.result.undo !== null) {
    showUndoToast({ concept: 'type', message, onUndo: input.result.undo });
  }
  input.setOutcome({ kind: 'applied', message, at: new Date().toISOString() });
  input.onApplied?.({
    caseId: input.repair.id,
    kind: input.repair.kind,
    actionId: 'change-type',
    undo: input.result.undo,
  });
}
