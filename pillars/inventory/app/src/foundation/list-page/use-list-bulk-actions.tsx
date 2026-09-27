import { useCallback, useState } from 'react';

import { showUndoToast } from '../feedback/undo-toast.js';
import {
  bulkItemCount,
  bulkFieldCandidates,
  bulkFieldPatch,
  typeChangeValues,
} from './bulk-action-model.js';
import { ListOverlays } from './list-overlays.js';

import type { ReactElement } from 'react';

import type { WebItem } from '../../inventory-web/item-row-model.js';
import type { BulkItemVerbs, BulkResult } from '../../inventory-web/item-verbs-bulk.js';
import type { CatalogueDescriptor } from '../../inventory-web/useCatalogueLookups.js';
import type { InventoryConcept } from '../model/icons.js';
import type { ItemRowModel } from '../model/model.js';
import type { SelectionApi } from '../selection/use-selection.js';
import type { BulkFieldInput } from './bulk-action-model.js';
import type { BulkActionKind, BulkActionState } from './bulk-action-types.js';
import type { usePlacementController } from './bulk-move-sheet.js';
import type { useListWriteActions } from './selection-dock.js';
import type { TrackedWrites } from './take-out.js';

interface ListBulkActionsInput {
  readonly rows: readonly ItemRowModel[];
  readonly webItems?: readonly WebItem[];
  readonly catalogue?: CatalogueDescriptor;
  readonly selection: SelectionApi;
  readonly tracked: TrackedWrites;
  readonly bulk: BulkItemVerbs;
  readonly writes: ReturnType<typeof useListWriteActions>;
  readonly placement: ReturnType<typeof usePlacementController>;
}

interface ListBulkActions {
  readonly openBulkAction: (kind: BulkActionKind) => void;
  readonly overlays: ReactElement;
}

async function runSelectionBulk(input: {
  ids: readonly string[];
  tracked: TrackedWrites;
  run: () => Promise<BulkResult>;
  concept: InventoryConcept;
  message: (count: number) => string;
  onClose: () => void;
  setBusy: (busy: boolean) => void;
}): Promise<void> {
  if (input.ids.length === 0) return;
  input.setBusy(true);
  try {
    const result = await input.tracked.track(input.ids, input.run);
    input.onClose();
    if (result.applied.length > 0 && result.undo !== null) {
      showUndoToast({
        concept: input.concept,
        message: input.message(result.applied.length),
        onUndo: result.undo,
      });
    }
  } catch {
    for (const id of input.ids)
      input.tracked.setRejection(id, 'The inventory service did not answer.');
  } finally {
    input.setBusy(false);
  }
}

interface BulkHandlerContext {
  readonly action: BulkActionState | null;
  readonly bulk: BulkItemVerbs;
  readonly catalogue?: CatalogueDescriptor;
  readonly rows: readonly ItemRowModel[];
  readonly webItems?: readonly WebItem[];
  readonly runBulk: (
    run: () => Promise<BulkResult>,
    concept: InventoryConcept,
    message: (count: number) => string,
    ids?: readonly string[]
  ) => Promise<void>;
}

function createSetTypeHandler(context: BulkHandlerContext): (typeKey: string) => Promise<void> {
  return async (typeKey: string): Promise<void> => {
    const action = context.action;
    const type = context.catalogue?.types.find((candidate) => candidate.key === typeKey);
    if (action === null || type === undefined) return;
    const values = typeChangeValues(context.webItems ?? [], type);
    await context.runBulk(
      () => context.bulk.changeType(action.ids, typeKey, values),
      'type',
      (count) => `Set type to ${type.label} on ${bulkItemCount(count)}`
    );
  };
}

function createSetFieldHandler(
  context: BulkHandlerContext
): (fieldId: string, fieldInput: BulkFieldInput) => Promise<void> {
  return async (fieldId: string, fieldInput: BulkFieldInput): Promise<void> => {
    const action = context.action;
    if (action === null) return;
    const candidate = bulkFieldCandidates(context.rows, action.ids, context.catalogue).find(
      (entry) => entry.field.id === fieldId
    );
    if (candidate === undefined) return;
    const patch = bulkFieldPatch(candidate.field, fieldInput);
    if (patch === null) return;
    const selected = new Set(action.ids);
    const writes = context.rows
      .filter((row) => selected.has(row.id) && row.typeId === candidate.field.typeId)
      .map((row) => ({ id: row.id, patches: [patch] }));
    await context.runBulk(
      () => context.bulk.editValues(writes),
      'type',
      (count) => `Set ${candidate.field.label} on ${bulkItemCount(count)}`,
      writes.map(({ id }) => id)
    );
  };
}

function createLifecycleHandler(
  context: BulkHandlerContext
): (act: Extract<BulkActionKind, 'retire' | 'discard'>, reason: string | null) => Promise<void> {
  return async (
    act: Extract<BulkActionKind, 'retire' | 'discard'>,
    reason: string | null
  ): Promise<void> => {
    const action = context.action;
    if (action === null) return;
    const concept = act === 'retire' ? 'retired' : 'discarded';
    const verb = act === 'retire' ? 'Retired' : 'Discarded';
    await context.runBulk(
      () =>
        context.bulk.setLifecycle(action.ids, act === 'retire' ? 'retired' : 'discarded', reason),
      concept,
      (count) => `${verb} ${bulkItemCount(count)}`
    );
  };
}

/** Binds the four typed bulk actions to the list overlays and bulk verbs. */
export function useListBulkActions(input: ListBulkActionsInput): ListBulkActions {
  const [bulkAction, setBulkAction] = useState<BulkActionState | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const openBulkAction = useCallback(
    (kind: BulkActionKind): void => {
      setBulkAction({ kind, ids: [...input.selection.selectedIds] });
    },
    [input.selection.selectedIds]
  );
  const runBulk = useCallback(
    (
      run: () => Promise<BulkResult>,
      concept: InventoryConcept,
      message: (count: number) => string,
      ids?: readonly string[]
    ): Promise<void> => {
      if (bulkAction === null) return Promise.resolve();
      return runSelectionBulk({
        ids: ids ?? bulkAction.ids,
        tracked: input.tracked,
        run,
        concept,
        message,
        onClose: () => setBulkAction(null),
        setBusy: setBulkBusy,
      });
    },
    [bulkAction, input.tracked]
  );
  const context = { ...input, action: bulkAction, runBulk };
  const onSetType = createSetTypeHandler(context);
  const onSetField = createSetFieldHandler(context);
  const onLifecycle = createLifecycleHandler(context);
  const overlays = (
    <ListOverlays
      placement={input.placement}
      writes={input.writes}
      bulkAction={bulkAction}
      rows={input.rows}
      catalogue={input.catalogue}
      busy={bulkBusy}
      onActionChange={(open) => {
        if (!open) setBulkAction(null);
      }}
      onSetType={onSetType}
      onSetField={onSetField}
      onLifecycle={onLifecycle}
    />
  );
  return { openBulkAction, overlays };
}
