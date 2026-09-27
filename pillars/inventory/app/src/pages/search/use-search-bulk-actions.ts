import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { useItemVerbs } from '../../inventory-web/item-verbs.js';
import { labelsHref } from '../labels-page/label-params.js';

import type { SelectionBarAction } from '../../foundation/model/contracts.js';
import type {
  FixedPlacement,
  ItemRowModel,
  PlacementTarget,
} from '../../foundation/model/model.js';
import type { SearchResultsState } from './use-search-results.js';

/** Item selection verbs and placement-picker state for the search page. */
export interface SearchBulkActions {
  readonly selectionActions: readonly SelectionBarAction[];
  readonly selectedItems: readonly ItemRowModel[];
  readonly moveTarget: (target: PlacementTarget) => void;
  readonly moveIds: readonly string[];
  readonly openMoveFor: (id: string) => void;
  readonly pickUp: (id: string) => void;
  readonly putBack: (id: string) => void;
  readonly moveOpen: boolean;
  readonly setMoveOpen: (open: boolean) => void;
}

function fixedPlacement(target: PlacementTarget): FixedPlacement | null {
  return target.kind === 'in-hand' ? null : target;
}

function buildSelectionActions({
  allInHand,
  bulkVerbs,
  navigate,
  onMove,
  ids,
}: {
  readonly allInHand: boolean;
  readonly bulkVerbs: ReturnType<typeof useBulkItemVerbs>;
  readonly navigate: ReturnType<typeof useNavigate>;
  readonly onMove: () => void;
  readonly ids: readonly string[];
}): readonly SelectionBarAction[] {
  return [
    {
      id: 'placement',
      label: 'Move',
      icon: INVENTORY_ICONS.move,
      onSelect: onMove,
      shortcutId: 'move',
    },
    {
      id: allInHand ? 'put-back' : 'pick-up',
      label: allInHand ? 'Put back' : 'Pick up',
      icon: allInHand ? INVENTORY_ICONS.putBack : INVENTORY_ICONS.pickUp,
      onSelect: () => void (allInHand ? bulkVerbs.putBack(ids) : bulkVerbs.pickUp(ids)),
    },
    {
      id: 'labels',
      label: 'Labels',
      icon: INVENTORY_ICONS.label,
      onSelect: () => void navigate(labelsHref(ids)),
    },
    {
      id: 'retire',
      label: 'Retire',
      icon: INVENTORY_ICONS.retired,
      onSelect: () => void bulkVerbs.setLifecycle(ids, 'retired', null),
      overflow: true,
    },
    {
      id: 'discard',
      label: 'Discard',
      icon: INVENTORY_ICONS.discarded,
      onSelect: () => void bulkVerbs.setLifecycle(ids, 'discarded', null),
      overflow: true,
    },
  ];
}

/** Binds row and bulk verbs to the current result selection. */
export function useSearchBulkActions(results: SearchResultsState): SearchBulkActions {
  const navigate = useNavigate();
  const verbs = useItemVerbs();
  const bulkVerbs = useBulkItemVerbs();
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveIds, setMoveIds] = useState<readonly string[]>([]);
  const selectedItems = useMemo(
    () =>
      results.selection.selectedIds.flatMap((id) => {
        const item = results.world.items.get(id);
        return item === undefined ? [] : [item];
      }),
    [results.selection.selectedIds, results.world.items]
  );
  const allInHand =
    selectedItems.length > 0 && selectedItems.every((item) => item.placement.kind === 'in-hand');
  const openMoveFor = useCallback((id: string): void => {
    setMoveIds([id]);
    setMoveOpen(true);
  }, []);
  const openMove = useCallback((): void => {
    setMoveIds(results.selection.selectedIds);
    setMoveOpen(true);
  }, [results.selection.selectedIds]);
  const moveTarget = useCallback(
    (target: PlacementTarget): void => {
      const fixed = fixedPlacement(target);
      if (fixed === null || moveIds.length === 0) return;
      void bulkVerbs.move(moveIds, fixed).finally(() => {
        setMoveIds([]);
        setMoveOpen(false);
      });
    },
    [bulkVerbs, moveIds]
  );
  const pickUp = useCallback((id: string): void => void verbs.pickUp(id), [verbs]);
  const putBack = useCallback((id: string): void => void verbs.putBack(id), [verbs]);
  const selectionActions = useMemo(
    () =>
      buildSelectionActions({
        allInHand,
        bulkVerbs,
        navigate,
        onMove: openMove,
        ids: results.selection.selectedIds,
      }),
    [allInHand, bulkVerbs, navigate, openMove, results.selection.selectedIds]
  );
  return {
    selectionActions,
    selectedItems,
    moveTarget,
    moveIds,
    openMoveFor,
    pickUp,
    putBack,
    moveOpen,
    setMoveOpen,
  };
}
