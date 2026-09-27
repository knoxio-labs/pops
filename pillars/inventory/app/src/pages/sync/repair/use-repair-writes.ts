import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useItemVerbs } from '../../../inventory-web/item-verbs.js';
import { useRevertEvent } from '../../../inventory-web/useRevertEvent.js';
import { errorMessage } from './repair-action-helpers.js';
import { performRepairWrite } from './repair-write-operations.js';

import type { BulkItemVerbs } from '../../../inventory-web/item-verbs-bulk.js';
import type { RepairCase } from '../sync-model.js';
import type { AppliedRepair, RepairOutcome } from './repair-outcome.js';
import type { WebAction } from './repair-plan.js';
import type { ChangeTypeWrite } from './repair-targets.js';

interface RepairWrites {
  busy: boolean;
  refusal: string | null;
  outcome: RepairOutcome | null;
  run: (action: WebAction) => Promise<void>;
}

interface RepairWriteOptions {
  bulk?: BulkItemVerbs;
  typeWrite?: ChangeTypeWrite | null;
  onApplied?: (applied: AppliedRepair) => void;
}

/** Runs the write actions exposed by a Sync repair plan. */
export function useRepairWrites(
  repair: RepairCase,
  options: RepairWriteOptions = {}
): RepairWrites {
  const queryClient = useQueryClient();
  const verbs = useItemVerbs();
  const revert = useRevertEvent();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RepairOutcome | null>(null);
  const run = useCallback(
    async (action: WebAction): Promise<void> => {
      setBusy(true);
      setRefusal(null);
      setOutcome(null);
      try {
        await performRepairWrite(action, {
          repair,
          verbs,
          queryClient,
          revert,
          bulk: options.bulk,
          typeWrite: options.typeWrite,
          onApplied: options.onApplied,
          setRefusal,
          setOutcome,
        });
      } catch (error: unknown) {
        setRefusal(`Not saved. ${errorMessage(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [options.bulk, options.onApplied, options.typeWrite, queryClient, repair, revert, verbs]
  );
  return { busy, refusal, outcome, run };
}
