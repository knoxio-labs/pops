import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { useBulkItemVerbs } from '../../../inventory-web/item-verbs-bulk.js';
import { usePublishedCatalogue } from '../../../inventory-web/useCatalogueLookups.js';
import { useWebItemDetail } from '../../../inventory-web/useWebItemDetail.js';
import {
  blockedReasonFor,
  changeTypeWrite,
  isWriteAction,
  typeIdFromRepair,
} from './repair-action-helpers.js';
import { useRepairUpload } from './use-repair-upload.js';
import { useRepairWrites } from './use-repair-writes.js';

import type { ReactElement } from 'react';

import type { RepairActionId, RepairCase } from '../sync-model.js';
import type { AppliedRepair, RepairOutcome } from './repair-outcome.js';
import type { WebAction } from './repair-plan.js';

/** The controls and mutation state for one Sync repair case. */
export interface RepairActions {
  /** Runs one plan action and resolves when its work has settled. */
  run: (action: WebAction) => Promise<void>;
  /** Returns the first reason that prevents an action from running. */
  blockedReason: (action: WebAction) => string | null;
  busy: boolean;
  /** The latest refused or failed web action, including its user-facing prefix. */
  refusal: string | null;
  /** The hidden single-file picker used by the upload action. */
  fileInput: ReactElement;
  /** The applied web action to show while the device-side follow-up remains. */
  outcome: Extract<RepairOutcome, { kind: 'applied' }> | null;
  /** A successful action that still requires a device-side follow-up. */
  followUp: string | null;
}

function appliedOutcomeFor(
  outcome: RepairOutcome | null
): Extract<RepairOutcome, { kind: 'applied' }> | null {
  return outcome?.kind === 'applied' ? outcome : null;
}

function actionOutcomeFor(
  writes: RepairOutcome | null,
  upload: RepairOutcome | null
): {
  outcome: Extract<RepairOutcome, { kind: 'applied' }> | null;
  followUp: string | null;
} {
  const local = writes ?? upload;
  return {
    outcome: appliedOutcomeFor(local),
    followUp: local?.kind === 'follow-up' ? local.message : null,
  };
}

function navigateForAction(
  actionId: RepairActionId,
  repair: RepairCase,
  typeId: string | null,
  navigate: ReturnType<typeof useNavigate>
): boolean {
  if (actionId === 'open-item') {
    void navigate(`/inventory/items/${repair.itemId}`);
    return true;
  }
  if (actionId === 'open-holder') {
    const wanted = repair.code?.wanted;
    if (wanted !== undefined) void navigate(`/inventory/search?code=${encodeURIComponent(wanted)}`);
    return true;
  }
  if (actionId === 'choose-option') {
    void navigate(`/inventory/items/${repair.itemId}/edit`);
    return true;
  }
  if (actionId === 'open-type') {
    if (typeId !== null) void navigate(`/inventory/types/${typeId}`);
    return true;
  }
  return false;
}

function useRepairBlockedReason(input: {
  repair: RepairCase;
  device: string;
  disabledReason?: string;
  catalogueStatus: 'pending' | 'error' | 'success';
  typeWrite: ReturnType<typeof changeTypeWrite>;
  detail: { typeId: string | null | undefined; isPending: boolean; isError: boolean };
}): (action: WebAction) => string | null {
  const { catalogueStatus, detail, device, disabledReason, repair, typeWrite } = input;
  return useCallback(
    (action: WebAction): string | null =>
      blockedReasonFor(action, {
        repair,
        device,
        disabledReason,
        catalogueStatus,
        changeType: typeWrite,
        detail,
      }),
    [catalogueStatus, detail, device, disabledReason, repair, typeWrite]
  );
}

/** Binds navigation, safe web writes, and photo upload state for one repair sheet. */
export function useRepairActions(input: {
  repair: RepairCase;
  device: string;
  disabledReason?: string;
  onApplied?: (applied: AppliedRepair) => void;
}): RepairActions {
  const { repair, device, disabledReason, onApplied } = input;
  const navigate = useNavigate();
  const catalogue = usePublishedCatalogue();
  const bulk = useBulkItemVerbs();
  const detail = useWebItemDetail(repair.kind === 'now-required' ? undefined : repair.itemId);
  const typeWrite = changeTypeWrite(repair, catalogue.types);
  const writes = useRepairWrites(repair, { bulk, typeWrite, onApplied });
  const upload = useRepairUpload({
    itemId: repair.itemId,
    existingPhotoCount: detail.data?.item.photos.length ?? 0,
  });
  const busy = writes.busy || upload.busy;
  const { outcome, followUp } = actionOutcomeFor(writes.outcome, upload.outcome);
  const blockedReason = useRepairBlockedReason({
    repair,
    device,
    disabledReason,
    catalogueStatus: catalogue.status,
    typeWrite,
    detail: {
      typeId: detail.data?.item.typeId,
      isPending: detail.isPending,
      isError: detail.isError,
    },
  });
  const run = useCallback(
    async (action: WebAction): Promise<void> => {
      const write = isWriteAction(action.id);
      if (blockedReason(action) !== null || (busy && write)) return;
      const typeId = typeIdFromRepair(repair) ?? detail.data?.item.typeId ?? null;
      if (navigateForAction(action.id, repair, typeId, navigate)) return;
      if (action.id === 'use-suggested' || action.id === 'restore') {
        await writes.run(action);
        return;
      }
      if (action.id === 'upload') {
        upload.open();
        return;
      }
      if (write) await writes.run(action);
    },
    [blockedReason, busy, detail.data?.item.typeId, navigate, repair, upload, writes]
  );
  return {
    run,
    blockedReason,
    busy,
    refusal: writes.refusal ?? upload.refusal,
    fileInput: upload.fileInput,
    outcome,
    followUp,
  };
}
