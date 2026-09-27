import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { useWebItemDetail } from '../../../inventory-web/useWebItemDetail.js';
import { blockedReasonFor, isWriteAction, typeIdFromRepair } from './repair-action-helpers.js';
import { useRepairUpload } from './use-repair-upload.js';
import { useRepairWrites } from './use-repair-writes.js';

import type { ReactElement } from 'react';

import type { RepairActionId, RepairCase, ResolvedEntry } from '../sync-model.js';
import type { RepairOutcome } from './repair-outcome.js';
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
  /** The applied action to show after the case has settled. */
  outcome: ResolvedEntry | null;
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

function outcomeFor(repair: RepairCase, localOutcome: RepairOutcome | null): ResolvedEntry | null {
  if (localOutcome === null) return null;
  return {
    id: repair.id,
    itemId: repair.itemId,
    itemName: repair.itemName,
    outcome: localOutcome.message,
    at: localOutcome.at,
    deviceId: repair.deviceId,
  };
}

/** Binds navigation, safe web writes, and photo upload state for one repair sheet. */
export function useRepairActions(input: {
  repair: RepairCase;
  device: string;
  disabledReason?: string;
}): RepairActions {
  const { repair, device, disabledReason } = input;
  const navigate = useNavigate();
  const detail = useWebItemDetail(repair.kind === 'now-required' ? undefined : repair.itemId);
  const writes = useRepairWrites(repair);
  const upload = useRepairUpload({
    itemId: repair.itemId,
    existingPhotoCount: detail.data?.item.photos.length ?? 0,
  });
  const busy = writes.busy || upload.busy;
  const outcome = outcomeFor(repair, writes.outcome ?? upload.outcome);
  const blockedReason = useCallback(
    (action: WebAction): string | null =>
      blockedReasonFor(action, {
        repair,
        device,
        disabledReason,
        detail: {
          typeId: detail.data?.item.typeId,
          isPending: detail.isPending,
          isError: detail.isError,
        },
      }),
    [detail.data?.item.typeId, detail.isError, detail.isPending, device, disabledReason, repair]
  );
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
  };
}
