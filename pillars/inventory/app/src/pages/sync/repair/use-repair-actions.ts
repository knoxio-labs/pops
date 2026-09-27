import { useQueryClient } from '@tanstack/react-query';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { showUndoToast } from '../../../foundation/feedback/undo-toast.js';
import { usePhotoUploads } from '../../../foundation/photos/use-photo-uploads.js';
import { useItemVerbs } from '../../../inventory-web/item-verbs.js';
import {
  sendInventoryMutation,
  type InventoryMutationOutcome,
} from '../../../inventory-web/mutation-client.js';
import { useRevertEvent } from '../../../inventory-web/useRevertEvent.js';
import { useWebItemDetail } from '../../../inventory-web/useWebItemDetail.js';
import { refusalReason } from '../../item-detail/detail-action-helpers.js';
import { planFor } from './repair-plan.js';

import type { ChangeEvent, ReactElement } from 'react';

import type { RepairActionId, RepairCase } from '../sync-model.js';
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
}

interface PendingUpload {
  fileName: string;
  beforeIds: ReadonlySet<string>;
  phase: 'adding' | 'observing';
}

function typeIdFromRepair(repair: RepairCase): string | null {
  if (!('typeId' in repair)) return null;
  return typeof repair.typeId === 'string' ? repair.typeId : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'The inventory service could not save this change.';
}

function outcomeReason(outcome: Exclude<InventoryMutationOutcome, { status: 'applied' }>): string {
  if (outcome.status === 'rejected') return outcome.reason || outcome.message;
  if (outcome.status === 'deferred') return `Waiting on ${outcome.waitingOn}.`;
  if ('field' in outcome && typeof outcome.field === 'string') {
    return `The ${outcome.field} changed elsewhere.`;
  }
  if ('heldBy' in outcome && typeof outcome.heldBy.name === 'string') {
    return `That code is already held by ${outcome.heldBy.name}.`;
  }
  if (outcome.kind === 'deleted') return 'The item was deleted elsewhere.';
  return 'The inventory service refused this change.';
}

function actionNeedsItem(action: RepairActionId): boolean {
  return action === 'use-suggested' || action === 'upload' || action === 'open-type';
}

/** Binds navigation, safe web writes, and photo upload state for one repair sheet. */
export function useRepairActions(input: {
  repair: RepairCase;
  device: string;
  disabledReason?: string;
}): RepairActions {
  const { repair, device, disabledReason } = input;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verbs = useItemVerbs();
  const revert = useRevertEvent();
  const detail = useWebItemDetail(repair.kind === 'now-required' ? undefined : repair.itemId);
  const uploads = usePhotoUploads('edit', repair.itemId, detail.data?.item.photos.length ?? 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const blockedReason = useCallback(
    (action: WebAction): string | null => {
      if (
        action.id === 'open-item' ||
        action.id === 'open-holder' ||
        action.id === 'choose-option'
      ) {
        return null;
      }
      if (
        action.id === 'use-mine' ||
        action.id === 'save-fitting' ||
        action.id === 'change-type' ||
        action.id === 'restore-reference'
      ) {
        return `${device}'s report does not name it. Open ${repair.itemName} to change it.`;
      }
      const reportedTypeId = typeIdFromRepair(repair);
      if (action.id === 'open-type' && reportedTypeId !== null) return null;
      if (action.id === 'open-type' && repair.kind === 'now-required') {
        return `${repair.itemName} exists only on ${device} until it is sent.`;
      }
      if (action.id === 'use-suggested' || action.id === 'restore' || action.id === 'upload') {
        if (disabledReason !== undefined) return disabledReason;
      }
      if (actionNeedsItem(action.id)) {
        if (detail.isPending) return `Loading ${repair.itemName}`;
        if (detail.isError) return `${repair.itemName} did not load`;
      }
      if (action.id === 'open-type' && detail.data?.item.typeId === null) {
        return `${repair.itemName} has no type`;
      }
      return null;
    },
    [detail.data?.item.typeId, detail.isError, detail.isPending, device, disabledReason, repair]
  );

  const applyResult = useCallback(
    (
      result: { status: 'applied'; undo: (() => Promise<void>) | null },
      message: string,
      concept: 'code' | 'item'
    ): void => {
      if (result.undo !== null) {
        showUndoToast({ concept, message, onUndo: result.undo });
      }
    },
    []
  );

  const runWrite = useCallback(
    async (action: WebAction): Promise<void> => {
      setBusy(true);
      setRefusal(null);
      try {
        if (action.id === 'use-suggested') {
          const suggested = repair.code?.suggested;
          if (suggested === undefined) return;
          const result = await verbs.setCode(repair.itemId, suggested);
          if (result.status === 'refused') {
            setRefusal(`Not saved. ${refusalReason(result.refusal)}`);
            return;
          }
          applyResult(result, `Code set to ${suggested}`, 'code');
          return;
        }
        if (action.id === 'restore') {
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
      } catch (error: unknown) {
        setRefusal(`Not saved. ${errorMessage(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [applyResult, queryClient, repair, revert, verbs]
  );

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file === undefined) return;
      setRefusal(null);
      setBusy(true);
      setPendingUpload({
        fileName: file.name,
        beforeIds: new Set(uploads.queue.map((entry) => entry.localId)),
        phase: 'adding',
      });
      void uploads
        .add([file])
        .then(() =>
          setPendingUpload((current) =>
            current === null ? null : { ...current, phase: 'observing' }
          )
        );
    },
    [uploads]
  );

  useEffect(() => {
    if (pendingUpload === null || pendingUpload.phase !== 'observing') return;
    const entry = uploads.queue.find(
      (candidate) => !pendingUpload.beforeIds.has(candidate.localId)
    );
    if (entry === undefined) {
      const line = uploads.refused.find((reason) =>
        reason.startsWith(`${pendingUpload.fileName} `)
      );
      setRefusal(`Not saved. ${line ?? uploads.refused.at(-1) ?? 'The photo was refused.'}`);
      setBusy(false);
      setPendingUpload(null);
      return;
    }
    if (entry.status === 'staged' || entry.status === 'uploading') return;
    if (entry.status === 'failed') {
      setRefusal(`Not saved. Did not upload: ${entry.reason ?? 'The upload failed.'}`);
    }
    setBusy(false);
    setPendingUpload(null);
  }, [pendingUpload, uploads.queue, uploads.refused]);

  const run = useCallback(
    async (action: WebAction): Promise<void> => {
      setRefusal(null);
      const writes =
        action.id === 'use-suggested' ||
        action.id === 'restore' ||
        action.id === 'upload' ||
        action.id === 'use-mine' ||
        action.id === 'save-fitting' ||
        action.id === 'change-type' ||
        action.id === 'restore-reference';
      if (blockedReason(action) !== null || (busy && writes)) return;
      if (action.id === 'open-item') {
        navigate(`/inventory/items/${repair.itemId}`);
        return;
      }
      if (action.id === 'open-holder') {
        const wanted = repair.code?.wanted;
        if (wanted !== undefined) navigate(`/inventory/search?code=${encodeURIComponent(wanted)}`);
        return;
      }
      if (action.id === 'choose-option') {
        navigate(`/inventory/items/${repair.itemId}/edit`);
        return;
      }
      if (action.id === 'open-type') {
        const typeId = typeIdFromRepair(repair) ?? detail.data?.item.typeId;
        if (typeId !== null && typeId !== undefined) navigate(`/inventory/types/${typeId}`);
        return;
      }
      if (action.id === 'use-suggested' || action.id === 'restore') {
        await runWrite(action);
        return;
      }
      if (action.id === 'upload') fileInputRef.current?.click();
    },
    [blockedReason, busy, detail.data?.item.typeId, navigate, repair, runWrite]
  );

  const fileInput = createElement('input', {
    ref: fileInputRef,
    type: 'file',
    accept: 'image/*,.heic,.heif',
    'aria-label': 'Choose a photo',
    className: 'hidden',
    onChange: onFileChange,
  });

  return { run, blockedReason, busy, refusal, fileInput };
}
