import { sendInventoryMutation } from '../../../inventory-web/mutation-client.js';
import { refusalReason } from '../../item-detail/detail-action-helpers.js';
import {
  fittingValuesFor,
  mineTargetFor,
  outcomeReason,
  referenceValueFor,
  typeReplacementFor,
} from './repair-action-helpers.js';
import { showAppliedResult, showVerbResult } from './repair-write-results.js';

import type { useQueryClient } from '@tanstack/react-query';

import type { useItemVerbs } from '../../../inventory-web/item-verbs.js';
import type { VerbResult } from '../../../inventory-web/item-verbs.js';
import type { useRevertEvent } from '../../../inventory-web/useRevertEvent.js';
import type { RepairCase } from '../sync-model.js';
import type { RepairOutcome } from './repair-outcome.js';
import type { WebAction } from './repair-plan.js';

/** Dependencies and state setters used while applying one repair action. */
export interface RepairWriteContext {
  repair: RepairCase;
  verbs: ReturnType<typeof useItemVerbs>;
  queryClient: ReturnType<typeof useQueryClient>;
  revert: ReturnType<typeof useRevertEvent>;
  setRefusal: (message: string | null) => void;
  setOutcome: (outcome: RepairOutcome | null) => void;
}

async function performSuggestedWrite(context: RepairWriteContext): Promise<void> {
  const { repair, verbs, setRefusal, setOutcome } = context;
  const suggested = repair.code?.suggested;
  if (suggested === undefined) return;
  const result = await verbs.setCode(repair.itemId, suggested);
  if (result.status === 'refused') {
    setRefusal(`Not saved. ${refusalReason(result.refusal)}`);
    return;
  }
  showAppliedResult(result, `Code set to ${suggested}`, 'code', setOutcome);
}

async function performRestoreWrite(context: RepairWriteContext): Promise<void> {
  const { repair, queryClient, revert, setRefusal, setOutcome } = context;
  const outcome = await sendInventoryMutation({
    command: { op: 'item.restoreDeleted', args: {} },
    entityId: repair.itemId,
  });
  if (outcome.status !== 'applied') {
    setRefusal(`Not saved. ${outcomeReason(outcome)}`);
    return;
  }
  void queryClient.invalidateQueries({ queryKey: ['inventory', 'web'] });
  const message = `Restored ${repair.itemName}`;
  showAppliedResult(
    {
      status: 'applied',
      seq: outcome.seq,
      undo: async () => revert({ seq: outcome.seq, entityId: repair.itemId }),
    },
    message,
    'item',
    setOutcome
  );
}

async function repairMineVerb(
  repair: RepairCase,
  verbs: ReturnType<typeof useItemVerbs>
): Promise<VerbResult | null> {
  const target = mineTargetFor(repair);
  if (target === null) return null;
  switch (target.kind) {
    case 'location':
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

async function performMineWrite(context: RepairWriteContext): Promise<void> {
  const { repair, verbs, setRefusal, setOutcome } = context;
  const result = await repairMineVerb(repair, verbs);
  if (result !== null) {
    showVerbResult(
      result,
      `Kept ${repair.mine?.value ?? 'the device change'}`,
      setRefusal,
      setOutcome
    );
  }
}

async function performFittingWrite(context: RepairWriteContext): Promise<void> {
  const { repair, verbs, setRefusal, setOutcome } = context;
  const values = fittingValuesFor(repair);
  if (values === null) return;
  const result = await verbs.editValues(repair.itemId, values);
  showVerbResult(result, `Saved fitting values for ${repair.itemName}`, setRefusal, setOutcome);
}

async function performTypeChangeWrite(context: RepairWriteContext): Promise<void> {
  const { repair, verbs, setRefusal, setOutcome } = context;
  const replacement = typeReplacementFor(repair);
  if (replacement === null) return;
  const result = await verbs.changeType(repair.itemId, replacement.typeId, replacement.values);
  showVerbResult(
    result,
    `Changed ${repair.itemName} to its replacement type`,
    setRefusal,
    setOutcome
  );
}

async function performReferenceWrite(context: RepairWriteContext): Promise<void> {
  const { repair, verbs, setRefusal, setOutcome } = context;
  const patch = referenceValueFor(repair);
  if (patch === null) return;
  const result = await verbs.editValues(repair.itemId, [patch]);
  showVerbResult(result, `Restored a reference on ${repair.itemName}`, setRefusal, setOutcome);
}

/** Applies the selected write action for a Sync repair case. */
export async function performRepairWrite(
  action: WebAction,
  context: RepairWriteContext
): Promise<void> {
  switch (action.id) {
    case 'use-suggested':
      await performSuggestedWrite(context);
      return;
    case 'restore':
      await performRestoreWrite(context);
      return;
    case 'use-mine':
      await performMineWrite(context);
      return;
    case 'save-fitting':
      await performFittingWrite(context);
      return;
    case 'change-type':
      await performTypeChangeWrite(context);
      return;
    case 'restore-reference':
      await performReferenceWrite(context);
      return;
    default:
      return;
  }
}
