import { useMemo, useState } from 'react';

import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { useBatchCreate } from '../../inventory-web/useBatchCreate.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useWebSearch } from '../../inventory-web/useWebSearch.js';
import { buildWorld } from '../model/placement-model.js';
import { useStoreHereActions } from './store-here-actions.js';
import { storeCandidates } from './store-here-model.js';
import { StoreHereSheetView } from './store-here-view.js';

import type { ReactElement } from 'react';

import type { ItemRowModel, StoreHereTarget } from '../model/contracts.js';
import type { PlacementWorld } from '../model/placement-model.js';

/** Props for the live Store here sheet used by place surfaces. */
export interface StoreHereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StoreHereTarget;
  offline: boolean;
}

function statusOf(
  placement: ReturnType<typeof usePlacementSources>,
  searchStatus: ReturnType<typeof useWebSearch>['status']
): 'pending' | 'error' | 'success' {
  if (placement.isError || searchStatus === 'error') return 'error';
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

/** Renders Store here with live placement reads and bulk writes for one target. */
export function StoreHereSheet({
  open,
  onOpenChange,
  target,
  offline,
}: StoreHereSheetProps): ReactElement {
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
    search: sources.search,
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
      onOpenTarget={actions.onOpenTarget}
      onOpenForm={actions.onOpenForm}
      onDone={() => onOpenChange(false)}
      offline={offline}
      busy={busy || sources.batch.isRunning}
    />
  );
}
