import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { showUndoToast } from '../../foundation/feedback/undo-toast';
import { buildWorld } from '../../foundation/model/placement-model';
import { storeCandidates, storeTarget } from '../../foundation/store-here/store-here-model';
import { StoreHereSheetView } from '../../foundation/store-here/store-here-view';
import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk';
import { useBatchCreate } from '../../inventory-web/useBatchCreate';
import { usePlacementSources } from '../../inventory-web/usePlacementSources';
import { useWebSearch } from '../../inventory-web/useWebSearch';

import type { Dispatch, ReactElement, SetStateAction } from 'react';

import type { ItemRowModel, PlacementWorld, StoreHereTarget } from '../../foundation/model';

/** Props for the live Store here sheet attached to an item-detail container. */
export interface DetailStoreHereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StoreHereTarget;
  offline: boolean;
}

function statusOf(
  placement: ReturnType<typeof usePlacementSources>,
  searchStatus: ReturnType<typeof useWebSearch>['status']
): 'pending' | 'error' | 'success' {
  if (placement.isError) return 'error';
  if (placement.isLoading || searchStatus === 'pending') return 'pending';
  return 'success';
}

function mergeWorld(
  placement: PlacementWorld,
  searchItems: readonly ItemRowModel[]
): PlacementWorld {
  const items = new Map(placement.items);
  for (const item of searchItems) items.set(item.id, item);
  return buildWorld([...items.values()], [...placement.locations.values()]);
}

function useStoreHereSources(query: string, target: StoreHereTarget) {
  const placement = usePlacementSources({ kind: 'items', ids: [] });
  const search = useWebSearch({ q: query, activeOnly: true, limit: 50 });
  const itemVerbs = useBulkItemVerbs();
  const batch = useBatchCreate();
  const world = useMemo(
    () =>
      mergeWorld(
        placement.world,
        search.results.items.map((hit) => hit.item)
      ),
    [placement.world, search.results.items]
  );
  const candidates = useMemo(() => storeCandidates(world, target, query), [query, target, world]);
  const status = statusOf(placement, search.status);
  return { placement, search, itemVerbs, batch, world, candidates, status };
}

function retryPlacement(placement: ReturnType<typeof usePlacementSources>): void {
  void Promise.all([
    placement.locationsQuery.refetch(),
    placement.openContainersQuery.refetch(),
    placement.closedContainersQuery.refetch(),
    placement.subjectItemsQuery.refetch(),
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

function useStoreHereActions({
  target,
  offline,
  busy,
  onOpenChange,
  placement,
  itemVerbs,
  batch,
  setBusy,
  setCreated,
}: {
  target: StoreHereTarget;
  offline: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  placement: ReturnType<typeof usePlacementSources>;
  itemVerbs: ReturnType<typeof useBulkItemVerbs>;
  batch: ReturnType<typeof useBatchCreate>;
  setBusy: (busy: boolean) => void;
  setCreated: Dispatch<SetStateAction<readonly string[]>>;
}) {
  const navigate = useNavigate();
  const retry = useCallback((): void => retryPlacement(placement), [placement]);
  const onCreate = useCallback(
    async (name: string): Promise<boolean> => {
      const created = await createItem(batch, target, name);
      if (created) setCreated((current) => [name, ...current]);
      return created;
    },
    [batch, setCreated, target]
  );
  const onStoreExisting = useCallback(
    (items: readonly ItemRowModel[]): void => {
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
    },
    [busy, itemVerbs, offline, onOpenChange, setBusy, target]
  );
  const onOpenForm = useCallback((): void => {
    void navigate(`/inventory/items/new?in=${encodeURIComponent(target.id)}`);
  }, [navigate, target.id]);
  return { retry, onCreate, onStoreExisting, onOpenForm };
}

/** Renders the Store here sheet with placement reads and its live mutations. */
export function DetailStoreHereSheet({
  open,
  onOpenChange,
  target,
  offline,
}: DetailStoreHereSheetProps): ReactElement {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [created, setCreated] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const sources = useStoreHereSources(query, target);
  const actions = useStoreHereActions({
    target,
    offline,
    busy,
    onOpenChange,
    placement: sources.placement,
    itemVerbs: sources.itemVerbs,
    batch: sources.batch,
    setBusy,
    setCreated,
  });

  return (
    <StoreHereSheetView
      open={open}
      onOpenChange={onOpenChange}
      target={target}
      world={sources.world}
      status={sources.status}
      onRetry={actions.retry}
      candidates={sources.candidates}
      query={query}
      onQuery={setQuery}
      selected={selected}
      onToggle={(id) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      created={created}
      onCreate={actions.onCreate}
      createError={null}
      onStoreExisting={actions.onStoreExisting}
      onOpenTarget={() => undefined}
      onOpenForm={actions.onOpenForm}
      onDone={() => onOpenChange(false)}
      offline={offline}
      busy={busy || sources.batch.isRunning}
    />
  );
}
