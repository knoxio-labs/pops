import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { showUndoToast } from '../../../foundation/feedback/undo-toast.js';
import { useItemVerbs } from '../../../inventory-web/item-verbs.js';
import { sendInventoryMutation } from '../../../inventory-web/mutation-client.js';
import { useRevertEvent } from '../../../inventory-web/useRevertEvent.js';
import { refusalReason } from '../../item-detail/detail-action-helpers.js';
import { errorMessage, outcomeReason } from './repair-action-helpers.js';

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

async function performRepairWrite(action: WebAction, context: RepairWriteContext): Promise<void> {
  const { repair, verbs, queryClient, revert, setRefusal } = context;
  if (action.id === 'use-suggested') {
    const suggested = repair.code?.suggested;
    if (suggested === undefined) return;
    const result = await verbs.setCode(repair.itemId, suggested);
    if (result.status === 'refused') {
      setRefusal(`Not saved. ${refusalReason(result.refusal)}`);
      return;
    }
    showAppliedResult(result, `Code set to ${suggested}`, 'code');
    return;
  }
  if (action.id !== 'restore') return;
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
