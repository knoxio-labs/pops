import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { showUndoToast } from '../feedback/undo-toast.js';
import { storeTarget } from './store-here-model.js';

import type { Dispatch, SetStateAction } from 'react';

import type { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import type { useBatchCreate } from '../../inventory-web/useBatchCreate.js';
import type { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import type { useWebSearch } from '../../inventory-web/useWebSearch.js';
import type { ItemRowModel, StoreHereTarget } from '../model/contracts.js';

type StoreHereActionOptions = {
  target: StoreHereTarget;
  offline: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  placement: ReturnType<typeof usePlacementSources>;
  search: ReturnType<typeof useWebSearch>;
  itemVerbs: ReturnType<typeof useBulkItemVerbs>;
  batch: ReturnType<typeof useBatchCreate>;
  setBusy: (busy: boolean) => void;
  setCreated: Dispatch<SetStateAction<readonly string[]>>;
};

function retrySources(
  placement: ReturnType<typeof usePlacementSources>,
  search: ReturnType<typeof useWebSearch>
): void {
  void Promise.all([
    placement.locationsQuery.refetch(),
    placement.openContainersQuery.refetch(),
    placement.closedContainersQuery.refetch(),
    placement.subjectItemsQuery.refetch(),
    search.refetch(),
  ]);
}

async function createItem(
  batch: ReturnType<typeof useBatchCreate>,
  target: StoreHereTarget,
  name: string
): Promise<boolean> {
  const destination =
    target.kind === 'container'
      ? { kind: 'container' as const, itemId: target.id }
      : { kind: 'location' as const, locationId: target.id };
  const result = await batch.commit(
    [{ code: '', name, note: '', quantity: '1', type: '', where: '' }],
    destination
  );
  return result.outcomes.some((outcome) => outcome.status === 'created');
}

function storeExisting(
  items: readonly ItemRowModel[],
  options: Pick<
    StoreHereActionOptions,
    'target' | 'offline' | 'busy' | 'onOpenChange' | 'itemVerbs' | 'setBusy'
  >
): void {
  const { target, offline, busy, onOpenChange, itemVerbs, setBusy } = options;
  if (items.length === 0 || offline || busy) return;
  setBusy(true);
  void itemVerbs
    .store(
      items.map((item) => item.id),
      storeTarget(target)
    )
    .then((result) => {
      if (result.undo !== null && result.applied.length > 0) {
        showUndoToast({
          concept: 'move',
          message: `Stored ${result.applied.length} item${result.applied.length === 1 ? '' : 's'} in ${target.name}`,
          onUndo: result.undo,
        });
      }
      if (result.applied.length > 0) onOpenChange(false);
    })
    .finally(() => setBusy(false));
}

/** Builds the live reads and mutations used by the Store here sheet. */
export function useStoreHereActions(options: StoreHereActionOptions) {
  const {
    target,
    offline,
    busy,
    onOpenChange,
    placement,
    search,
    itemVerbs,
    batch,
    setBusy,
    setCreated,
  } = options;
  const navigate = useNavigate();
  const retry = useCallback((): void => retrySources(placement, search), [placement, search]);
  const onCreate = useCallback(
    async (name: string): Promise<boolean> => {
      const created = await createItem(batch, target, name);
      if (created) setCreated((current) => [name, ...current]);
      return created;
    },
    [batch, setCreated, target]
  );
  const onStoreExisting = useCallback(
    (items: readonly ItemRowModel[]): void =>
      storeExisting(items, { target, offline, busy, onOpenChange, itemVerbs, setBusy }),
    [busy, itemVerbs, offline, onOpenChange, setBusy, target]
  );
  const onOpenTarget = useCallback((): void => {
    void navigate(
      target.kind === 'location'
        ? `/inventory/locations/${target.id}`
        : `/inventory/items/${target.id}`
    );
  }, [navigate, target]);
  const onOpenForm = useCallback((): void => {
    void navigate(`/inventory/items/new?in=${encodeURIComponent(target.id)}`);
  }, [navigate, target.id]);
  return { retry, onCreate, onStoreExisting, onOpenTarget, onOpenForm };
}
