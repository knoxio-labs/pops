import { useEffect, useMemo, useState } from 'react';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { orderInHand, planPutBackAll } from '../../foundation/in-hand/in-hand-model.js';
import { refusalReason } from '../../foundation/list-page/selection-actions.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { MAX_LABEL_IDS } from '../labels-page/label-params.js';
import { useInHandPageActions } from './in-hand-page-actions.js';
import { useInHandPageShortcuts } from './in-hand-page-shortcuts.js';

import type { Dispatch, SetStateAction } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { BulkResult } from '../../inventory-web/item-verbs-bulk-types.js';
import type { ChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import type { ItemRows } from '../../inventory-web/useWebItems.js';
import type { InHandPageActions } from './in-hand-page-actions.js';

/** The body state used while the in-hand query settles. */
export type InHandBodyState = 'loading' | 'error' | 'list';

/** The inline refusal state owned by the in-hand page. */
export interface InHandRejections {
  readonly values: Readonly<Record<string, string>>;
  readonly clear: (ids: readonly string[]) => void;
  readonly set: (id: string, reason: string) => void;
  readonly applyBulk: (ids: readonly string[], result: BulkResult) => void;
}

/** All read state and derived placement data needed by the in-hand view. */
export interface InHandPageData {
  readonly online: boolean;
  readonly itemRows: ItemRows;
  readonly pendingIds: ReadonlySet<string>;
  readonly items: readonly ItemRowModel[];
  readonly itemIds: readonly string[];
  readonly selection: SelectionApi;
  readonly placement: ReturnType<typeof usePlacementSources>;
  readonly world: PlacementWorld;
  readonly changed: ChangedElsewhere;
  readonly disabledReason: string | undefined;
  readonly body: InHandBodyState;
  readonly plan: ReturnType<typeof planPutBackAll>;
  readonly rejections: InHandRejections;
}

/** The complete state and command surface consumed by the in-hand page. */
export interface InHandPageModel {
  readonly data: InHandPageData;
  readonly actions: InHandPageActions;
  readonly selectionActions: ReturnType<typeof useInHandPageShortcuts>;
}

interface PickerState {
  readonly pickerIds: readonly string[];
  readonly pickerAnchor: 'row' | 'dock' | null;
  readonly setPickerIds: Dispatch<SetStateAction<readonly string[]>>;
  readonly setPickerAnchor: Dispatch<SetStateAction<'row' | 'dock' | null>>;
}

function useRejectionState(): InHandRejections {
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});
  const clear = (ids: readonly string[]): void => {
    setValues((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  };
  const set = (id: string, reason: string): void => {
    setValues((current) => ({ ...current, [id]: reason }));
  };
  const applyBulk = (ids: readonly string[], result: BulkResult): void => {
    setValues((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      result.refused.forEach(({ id, refusal }) => {
        next[id] = refusalReason(refusal);
      });
      return next;
    });
  };
  return { values, clear, set, applyBulk };
}

function handRows(rows: readonly ItemRowModel[]): ItemRowModel[] {
  return rows.filter((row) => row.placement.kind === 'in-hand');
}

function loadingAllPages(itemRows: ItemRows): boolean {
  return (
    itemRows.status === 'pending' ||
    itemRows.isFetchingNextPage ||
    (itemRows.status === 'success' && itemRows.hasNextPage)
  );
}

function actionDisabledReason(online: boolean): string | undefined {
  return online ? undefined : OFFLINE_REASON;
}

function bodyState(itemRows: ItemRows): InHandBodyState {
  if (itemRows.status === 'error') return 'error';
  if (loadingAllPages(itemRows)) return 'loading';
  return 'list';
}

function useInHandPageData(pickerIds: readonly string[]): InHandPageData {
  const online = useOnline();
  const itemRows = useItemRows({ placementKind: 'hand' }, MAX_LABEL_IDS);
  const pendingIds = usePendingItemIds();
  const rejections = useRejectionState();
  const items = useMemo<ItemRowModel[]>(
    () => orderInHand(handRows(itemRows.rows)),
    [itemRows.rows]
  );
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const selection = useSelection(itemIds);
  const pickerSubject = useMemo(() => ({ kind: 'items' as const, ids: pickerIds }), [pickerIds]);
  const placement = usePlacementSources(pickerSubject);
  const world = useMemo(
    () =>
      buildWorld(
        [...placement.world.items.values(), ...items],
        [...placement.world.locations.values()]
      ),
    [items, placement.world]
  );
  const changed = useChangedElsewhere({
    queryKeys: [[...WEB_ITEMS_QUERY_KEY, 'list']],
    enabled: itemRows.status === 'success',
  });
  const body = bodyState(itemRows);

  useEffect(() => {
    if (itemRows.status === 'success' && itemRows.hasNextPage && !itemRows.isFetchingNextPage) {
      itemRows.fetchNextPage();
    }
  }, [itemRows]);

  return {
    online,
    itemRows,
    pendingIds,
    items,
    itemIds,
    selection,
    placement,
    world,
    changed,
    disabledReason: actionDisabledReason(online),
    body,
    plan: planPutBackAll(items),
    rejections,
  };
}

/** Binds the in-hand reads, selection model, commands, and keyboard actions. */
export function useInHandPageModel(): InHandPageModel {
  const [pickerIds, setPickerIds] = useState<readonly string[]>([]);
  const [pickerAnchor, setPickerAnchor] = useState<'row' | 'dock' | null>(null);
  const data = useInHandPageData(pickerIds);
  const pickerState: PickerState = {
    pickerIds,
    pickerAnchor,
    setPickerIds,
    setPickerAnchor,
  };
  const actions = useInHandPageActions(data, pickerState);
  const selectionActions = useInHandPageShortcuts(data, actions);
  return { data, actions, selectionActions };
}
