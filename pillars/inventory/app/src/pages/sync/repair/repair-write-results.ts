import { showUndoToast } from '../../../foundation/feedback/undo-toast.js';
import { refusalReason } from '../../item-detail/detail-action-helpers.js';

import type { VerbResult } from '../../../inventory-web/item-verbs.js';
import type { RepairOutcome } from './repair-outcome.js';

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
  setOutcome({ message, at: new Date().toISOString() });
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
