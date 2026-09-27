import { useCallback } from 'react';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { returnRoute } from '../../foundation/in-hand/in-hand-model.js';
import { refusalReason } from '../../foundation/list-page/selection-actions.js';
import { targetName } from '../../foundation/model/placement-model.js';
import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { useItemVerbs } from '../../inventory-web/item-verbs.js';

import type { PlacementTarget } from '../../foundation/model/model.js';
import type { BulkItemVerbs, BulkResult } from '../../inventory-web/item-verbs-bulk.js';
import type { ItemVerbs } from '../../inventory-web/item-verbs.js';
import type { InHandPageData, InHandRejections } from './in-hand-page-types.js';

/** The mutation commands available to the in-hand page. */
export interface InHandPageCommands {
  readonly putBack: (id: string) => void;
  readonly putBackAll: (ids: readonly string[]) => void;
  readonly move: (ids: readonly string[], target: PlacementTarget) => void;
}

function placeBackMessage(
  items: readonly InHandPageData['items'][number][],
  applied: readonly string[],
  data: InHandPageData
): string {
  if (applied.length === 1) {
    const item = items.find((entry) => entry.id === applied[0]);
    if (item !== undefined) {
      const route = returnRoute(item);
      if (route.kind === 'back')
        return `Put ${item.name} back in ${targetName(data.world, route.to)}`;
    }
  }
  return `Put back ${applied.length} items`;
}

async function runBulk(
  ids: readonly string[],
  run: (ids: readonly string[]) => Promise<BulkResult>,
  rejections: InHandRejections,
  onApplied: (result: BulkResult) => void
): Promise<void> {
  try {
    const result = await run(ids);
    rejections.applyBulk(ids, result);
    onApplied(result);
  } catch {
    ids.forEach((id) => rejections.set(id, 'The inventory service did not answer.'));
  }
}

function usePutBackCommands(
  data: InHandPageData,
  verbs: ItemVerbs,
  bulkVerbs: BulkItemVerbs
): Pick<InHandPageCommands, 'putBack' | 'putBackAll'> {
  const putBackAsync = useCallback(
    async (id: string): Promise<void> => {
      if (!data.online) return;
      const item = data.world.items.get(id);
      if (item === undefined) return;
      const route = returnRoute(item);
      if (route.kind !== 'back') return;
      data.rejections.clear([id]);
      const result = await verbs.putBack(id);
      if (result.status === 'refused') {
        data.rejections.set(id, refusalReason(result.refusal));
        return;
      }
      if (result.undo !== null) {
        showUndoToast({
          concept: 'putBack',
          message: `Put ${item.name} back in ${targetName(data.world, route.to)}`,
          onUndo: result.undo,
        });
      }
    },
    [data, verbs]
  );
  const putBackAllAsync = useCallback(
    async (ids: readonly string[]): Promise<void> => {
      if (!data.online || ids.length === 0) return;
      data.rejections.clear(ids);
      await runBulk(ids, bulkVerbs.putBack, data.rejections, (result) => {
        if (result.applied.length > 0 && result.undo !== null) {
          showUndoToast({
            concept: 'putBack',
            message: placeBackMessage(data.items, result.applied, data),
            onUndo: result.undo,
          });
        }
      });
    },
    [bulkVerbs.putBack, data]
  );
  return {
    putBack: (id) => void putBackAsync(id),
    putBackAll: (ids) => void putBackAllAsync(ids),
  };
}

function useMoveCommand(
  data: InHandPageData,
  verbs: ItemVerbs,
  bulkVerbs: BulkItemVerbs
): InHandPageCommands['move'] {
  const moveAsync = useCallback(
    async (ids: readonly string[], target: PlacementTarget): Promise<void> => {
      if (!data.online || target.kind === 'in-hand' || ids.length === 0) return;
      data.rejections.clear(ids);
      if (ids.length > 1) {
        await runBulk(
          ids,
          (selected) => bulkVerbs.move(selected, target),
          data.rejections,
          (result) => {
            if (result.applied.length > 0 && result.undo !== null) {
              showUndoToast({
                concept: 'move',
                message: `Moved ${result.applied.length} items to ${targetName(data.world, target)}`,
                onUndo: result.undo,
              });
            }
          }
        );
        return;
      }
      const id = ids[0];
      if (id === undefined) return;
      const item = data.world.items.get(id);
      if (item === undefined) return;
      const result = await verbs.move(id, target);
      if (result.status === 'refused') {
        data.rejections.set(id, refusalReason(result.refusal));
        return;
      }
      if (result.undo !== null) {
        showUndoToast({
          concept: 'move',
          message: `Moved ${item.name} to ${targetName(data.world, target)}`,
          onUndo: result.undo,
        });
      }
    },
    [bulkVerbs, data, verbs]
  );
  return (ids, target) => void moveAsync(ids, target);
}

/** Creates the typed single- and bulk-item commands used by the page. */
export function useInHandPageCommands(data: InHandPageData): InHandPageCommands {
  const verbs = useItemVerbs();
  const bulkVerbs = useBulkItemVerbs();
  const putBack = usePutBackCommands(data, verbs, bulkVerbs);
  const move = useMoveCommand(data, verbs, bulkVerbs);
  return { ...putBack, move };
}
