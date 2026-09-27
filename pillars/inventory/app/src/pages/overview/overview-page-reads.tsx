import { useCallback, useMemo } from 'react';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { toEventModel } from '../../inventory-web/event-model.js';
import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useSyncAttention } from '../../inventory-web/useSyncLedger.js';
import { WEB_EVENTS_QUERY_KEY, useWebEvents } from '../../inventory-web/useWebEvents.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { WEB_SUMMARY_QUERY_KEY, useWebSummary } from '../../inventory-web/useWebSummary.js';

import type { PickerSubject } from '../../foundation/model/contracts.js';
import type { EventModel, ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebEvent } from '../../inventory-web/useWebEvents.js';

type Summary = ReturnType<typeof useWebSummary>;
type ItemRows = ReturnType<typeof useItemRows>;
type Events = ReturnType<typeof useWebEvents>;
type Catalogue = ReturnType<typeof useCatalogueLookups>;
type Attention = ReturnType<typeof useSyncAttention>;
type Changed = ReturnType<typeof useChangedElsewhere>;

/** Read results and derived world data used by the Overview model. */
export interface OverviewReads {
  readonly summary: Summary;
  readonly openContainers: ItemRows;
  readonly inHand: ItemRows;
  readonly events: Events;
  readonly catalogue: Catalogue;
  readonly attention: Attention;
  readonly changed: Changed;
  readonly world: PlacementWorld;
  readonly pickerWorld: PlacementWorld;
  readonly pickerSubject: PickerSubject;
  readonly pickerRecents: readonly import('../../foundation/model/model.js').PlacementTarget[];
  readonly createLocation: {
    readonly mutateAsync: (input: { name: string; parentId: string | null }) => Promise<unknown>;
  };
  readonly eventModels: readonly EventModel[];
  readonly eventById: ReadonlyMap<string, WebEvent>;
  readonly refetchAll: () => void;
  readonly now: string;
}

function mergeWorld(source: PlacementWorld, rows: readonly ItemRowModel[]): PlacementWorld {
  return buildWorld([...source.items.values(), ...rows], [...source.locations.values()]);
}

/** Reads the Overview queries and derives the placement and event models. */
export function useOverviewReads(pickerItemId: string | null): OverviewReads {
  const summary = useWebSummary();
  const openContainers = useItemRows({ isContainer: 'true', access: 'open', sort: 'name' }, 50);
  const inHand = useItemRows({ placementKind: 'hand', sort: 'updated' }, 50);
  const events = useWebEvents({ limit: 12 });
  const catalogue = useCatalogueLookups();
  const attention = useSyncAttention();
  const pageSubject = useMemo<PickerSubject>(() => ({ kind: 'items', ids: [] }), []);
  const placement = usePlacementSources(pageSubject);
  const pickerSubject = useMemo<PickerSubject>(
    () => ({ kind: 'items', ids: pickerItemId === null ? [] : [pickerItemId] }),
    [pickerItemId]
  );
  const pickerSources = usePlacementSources(pickerSubject);
  const world = useMemo(
    () => mergeWorld(placement.world, [...openContainers.rows, ...inHand.rows]),
    [inHand.rows, openContainers.rows, placement.world]
  );
  const eventModels = useMemo(
    () => events.events.map((event) => toEventModel(event, world, catalogue.typeNameById)),
    [catalogue.typeNameById, events.events, world]
  );
  const eventById = useMemo(
    () => new Map(events.events.map((event): [string, WebEvent] => [String(event.seq), event])),
    [events.events]
  );
  const readsSucceeded =
    summary.status === 'success' &&
    openContainers.status === 'success' &&
    inHand.status === 'success' &&
    events.status === 'success';
  const changed = useChangedElsewhere({
    queryKeys: [WEB_SUMMARY_QUERY_KEY, [...WEB_ITEMS_QUERY_KEY, 'list'], WEB_EVENTS_QUERY_KEY],
    enabled: readsSucceeded,
  });
  const refetchAll = useCallback((): void => {
    void summary.refetch();
    openContainers.refetch();
    inHand.refetch();
    events.refetch();
  }, [events, inHand, openContainers, summary]);
  return {
    summary,
    openContainers,
    inHand,
    events,
    catalogue,
    attention,
    changed,
    world,
    pickerWorld: pickerSources.world,
    pickerSubject,
    pickerRecents: pickerSources.recents,
    createLocation: pickerSources.createLocation,
    eventModels,
    eventById,
    refetchAll,
    now: new Date().toISOString(),
  };
}

/** Chooses the Overview body state from the four required reads. */
export function bodyState(reads: OverviewReads): 'loading' | 'error' | 'first-run' | 'panels' {
  const statuses = [
    reads.summary.status,
    reads.openContainers.status,
    reads.inHand.status,
    reads.events.status,
  ];
  if (statuses.some((status) => status === 'pending')) return 'loading';
  if (statuses.some((status) => status === 'error') || reads.summary.data === undefined) {
    return 'error';
  }
  const { items, containers, locations } = reads.summary.data.counts;
  return items === 0 && containers === 0 && locations === 0 ? 'first-run' : 'panels';
}
