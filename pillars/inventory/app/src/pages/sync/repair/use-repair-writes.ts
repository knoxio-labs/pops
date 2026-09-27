import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { showUndoToast } from '../../../foundation/feedback/undo-toast.js';
import { useItemVerbs } from '../../../inventory-web/item-verbs.js';
import { sendInventoryMutation } from '../../../inventory-web/mutation-client.js';
import { useRevertEvent } from '../../../inventory-web/useRevertEvent.js';
import { refusalReason } from '../../item-detail/detail-action-helpers.js';
import {
  errorMessage,
  fittingValuesFor,
  mineTargetFor,
  outcomeReason,
  referenceValueFor,
  typeReplacementFor,
} from './repair-action-helpers.js';

import type { VerbResult } from '../../../inventory-web/item-verbs.js';
import type { RepairCase } from '../sync-model.js';
import type { WebAction } from './repair-plan.js';

interface RepairWrites {
  busy: boolean;
  refusal: string | null;
  run: (action: WebAction) => Promise<void>;
}

interface RepairWriteContext {
  repair: RepairCase;
  verbs: ReturnType<typeof useItemVerbs>;
  queryClient: ReturnType<typeof useQueryClient>;
  revert: ReturnType<typeof useRevertEvent>;
  setRefusal: (message: string | null) => void;
}

function showAppliedResult(
  result: { status: 'applied'; undo: (() => Promise<void>) | null },
  message: string,
  concept: 'code' | 'item'
): void {
  if (result.undo !== null) showUndoToast({ concept, message, onUndo: result.undo });
}

function showVerbResult(
  result: VerbResult,
  message: string,
  setRefusal: (message: string | null) => void
): void {
  if (result.status === 'refused') {
    setRefusal(`Not saved. ${refusalReason(result.refusal)}`);
    return;
  }
  showAppliedResult(result, message, 'item');
}

async function performSuggestedWrite(
  repair: RepairCase,
  verbs: ReturnType<typeof useItemVerbs>,
  setRefusal: (message: string | null) => void
): Promise<void> {
  const suggested = repair.code?.suggested;
  if (suggested === undefined) return;
  const result = await verbs.setCode(repair.itemId, suggested);
  if (result.status === 'refused') {
    setRefusal(`Not saved. ${refusalReason(result.refusal)}`);
    return;
  }
  showAppliedResult(result, `Code set to ${suggested}`, 'code');
}

async function performRestoreWrite(context: RepairWriteContext): Promise<void> {
  const { repair, queryClient, revert, setRefusal } = context;
  const outcome = await sendInventoryMutation({
    command: { op: 'item.restoreDeleted', args: {} },
    entityId: repair.itemId,
  });
  if (outcome.status !== 'applied') {
    setRefusal(`Not saved. ${outcomeReason(outcome)}`);
    return;
  }
  void queryClient.invalidateQueries({ queryKey: ['inventory', 'web'] });
  showUndoToast({
    concept: 'item',
    message: `Restored ${repair.itemName}`,
    onUndo: () => revert({ seq: outcome.seq, entityId: repair.itemId }),
  });
}

async function repairMineVerb(
  repair: RepairCase,
  verbs: ReturnType<typeof useItemVerbs>
): Promise<VerbResult | null> {
  const target = mineTargetFor(repair);
  if (target === null) return null;
  switch (target.kind) {
    case 'location':
      return verbs.move(repair.itemId, target);
    case 'container':
      return verbs.move(repair.itemId, target);
    case 'hand':
      return verbs.pickUp(repair.itemId);
    case 'name':
      return verbs.edit(repair.itemId, { name: target.value });
    case 'note':
      return verbs.edit(repair.itemId, { note: target.value });
    case 'field':
      return verbs.editValues(repair.itemId, [target.patch]);
  }
}

async function performMineWrite(
  repair: RepairCase,
  verbs: ReturnType<typeof useItemVerbs>,
  setRefusal: (message: string | null) => void
): Promise<void> {
  const result = await repairMineVerb(repair, verbs);
  if (result !== null) {
    showVerbResult(result, `Kept ${repair.mine?.value ?? 'the device change'}`, setRefusal);
  }
}

async function performFittingWrite(
  repair: RepairCase,
  verbs: ReturnType<typeof useItemVerbs>,
  setRefusal: (message: string | null) => void
): Promise<void> {
  const values = fittingValuesFor(repair);
  if (values === null) return;
  const result = await verbs.editValues(repair.itemId, values);
  showVerbResult(result, `Saved fitting values for ${repair.itemName}`, setRefusal);
}

async function performTypeChangeWrite(
  repair: RepairCase,
  verbs: ReturnType<typeof useItemVerbs>,
  setRefusal: (message: string | null) => void
): Promise<void> {
  const replacement = typeReplacementFor(repair);
  if (replacement === null) return;
  const result = await verbs.changeType(repair.itemId, replacement.typeId, replacement.values);
  showVerbResult(result, `Changed ${repair.itemName} to its replacement type`, setRefusal);
}

async function performReferenceWrite(
  repair: RepairCase,
  verbs: ReturnType<typeof useItemVerbs>,
  setRefusal: (message: string | null) => void
): Promise<void> {
  const patch = referenceValueFor(repair);
  if (patch === null) return;
  const result = await verbs.editValues(repair.itemId, [patch]);
  showVerbResult(result, `Restored a reference on ${repair.itemName}`, setRefusal);
}

async function performRepairWrite(action: WebAction, context: RepairWriteContext): Promise<void> {
  switch (action.id) {
    case 'use-suggested':
      await performSuggestedWrite(context.repair, context.verbs, context.setRefusal);
      return;
    case 'restore':
      await performRestoreWrite(context);
      return;
    case 'use-mine':
      await performMineWrite(context.repair, context.verbs, context.setRefusal);
      return;
    case 'save-fitting':
      await performFittingWrite(context.repair, context.verbs, context.setRefusal);
      return;
    case 'change-type':
      await performTypeChangeWrite(context.repair, context.verbs, context.setRefusal);
      return;
    case 'restore-reference':
      await performReferenceWrite(context.repair, context.verbs, context.setRefusal);
      return;
    default:
      return;
  }
}

/** Runs the write actions exposed by a Sync repair plan. */
export function useRepairWrites(repair: RepairCase): RepairWrites {
  const queryClient = useQueryClient();
  const verbs = useItemVerbs();
  const revert = useRevertEvent();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const run = useCallback(
    async (action: WebAction): Promise<void> => {
      setBusy(true);
      setRefusal(null);
      try {
        await performRepairWrite(action, { repair, verbs, queryClient, revert, setRefusal });
      } catch (error: unknown) {
        setRefusal(`Not saved. ${errorMessage(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [queryClient, repair, revert, verbs]
  );
  return { busy, refusal, run };
}
