import { useQueryClient } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { createElement as h, useCallback, useState, type ReactNode } from 'react';

import { CodeBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import * as placement from '../../foundation/model/placement-model.js';
import { LOCATIONS_TREE_QUERY_KEY, WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import * as registry from '../../inventory-web/useConnectionsRegistry.js';
import * as fixtureSource from '../../inventory-web/useFixtures.js';
import * as placementSource from '../../inventory-web/usePlacementSources.js';
import * as webItems from '../../inventory-web/useWebItems.js';
import { connectRefusal, itemQuery, retryFor } from './connect-refusal.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { FixtureListRow } from '../../inventory-web/useFixtures.js';
import type { Candidate, ConnectFailure, ReadStatus, RefusalCandidate } from './connect-refusal.js';

/** One candidate shown by a connect-end picker. */
export type PickOption = {
  key: string;
  mark: ReactNode;
  title: string;
  meta?: ReactNode;
  detail?: string;
  refusal?: string;
};
type Draft = {
  fromKey: string | null;
  toKey: string | null;
  toKind: 'item' | 'fixture';
  fromQuery: string;
  toQuery: string;
  failure: ConnectFailure | null;
  isConnecting: boolean;
};
const EMPTY_DRAFT: Draft = {
  fromKey: null,
  toKey: null,
  toKind: 'item',
  fromQuery: '',
  toQuery: '',
  failure: null,
  isConnecting: false,
};

/** Owns transient endpoint, query, and mutation state while the dialog is open. */
export function useConnectDraft() {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  return {
    ...draft,
    update: (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch })),
    reset: useCallback(() => setDraft(EMPTY_DRAFT), []),
  };
}

const KIND_LABELS = {
  antenna: 'Antenna point',
  light: 'Light fitting',
  network: 'Network port',
  power: 'Power outlet',
  switch: 'Switch',
  water: 'Water point',
} as const;
const fixtureMark = h(Plug, { className: 'size-4', 'aria-hidden': true });
function roomOf(world: placement.PlacementWorld, id: string): string {
  const locationId = placement.effectiveLocationId(world, id);
  if (locationId === null) return 'In hand';
  const path = placement.locationPath(world, locationId);
  return (path[1] ?? path[0])?.name ?? 'Unknown place';
}
function itemOption(
  item: ItemRowModel,
  world: placement.PlacementWorld,
  refusal?: string
): PickOption {
  const room = roomOf(world, item.id);
  return {
    key: `item:${item.id}`,
    mark: h(ItemMark, { item }),
    title: item.name,
    meta: h(
      'span',
      null,
      h(CodeBadge, { code: item.code }),
      h('span', { className: 'truncate' }, room)
    ),
    detail: `${item.code ?? ''} ${room}`.trim(),
    refusal: item.lifecycle === 'active' ? refusal : `${item.name} is ${item.lifecycle}.`,
  };
}

function sortedOptions<T extends { name: string }>(
  rows: readonly T[],
  map: (row: T) => PickOption
): PickOption[] {
  return rows.toSorted((a, b) => a.name.localeCompare(b.name)).map(map);
}

/** Builds sorted item candidates, excluding containers. */
export function itemOptions(
  rows: readonly ItemRowModel[],
  world: placement.PlacementWorld,
  refusal: (item: ItemRowModel) => string | undefined
): PickOption[] {
  return sortedOptions(
    rows.filter((item) => item.container === null),
    (item) => itemOption(item, world, refusal(item))
  );
}
function fixtureOption(
  fixture: FixtureListRow,
  places: ReadonlyMap<string, LocationModel>,
  refusal?: string
): PickOption {
  const place = fixture.locationId === null ? undefined : places.get(fixture.locationId);
  const kind = KIND_LABELS[fixture.type as keyof typeof KIND_LABELS] ?? fixture.type;
  return {
    key: `fixture:${fixture.id}`,
    mark: fixtureMark,
    title: fixture.name,
    meta: h('span', { className: 'truncate' }, kind, place === undefined ? '' : `, ${place.name}`),
    detail: `${kind}${place === undefined ? '' : `, ${place.name}`}`,
    refusal,
  };
}
/** Builds sorted fixture candidates with their kind and resolved place. */
export function fixtureOptions(
  rows: readonly FixtureListRow[],
  locations: readonly LocationModel[],
  refusal: (fixture: FixtureListRow) => string | undefined
): PickOption[] {
  const places = new Map(locations.map((location) => [location.id, location]));
  return sortedOptions(rows, (fixture) => fixtureOption(fixture, places, refusal(fixture)));
}
/** Adds every candidate row missing from the placement world exactly once. */
export function optionsWorld(
  world: placement.PlacementWorld,
  rows: readonly ItemRowModel[],
  locations: readonly LocationModel[]
): placement.PlacementWorld {
  const items = new Map(world.items);
  for (const row of rows) if (!items.has(row.id)) items.set(row.id, row);
  return placement.buildWorld([...items.values()], locations);
}
/** Reads the item, fixture, placement, and connection sources used by Connect. */
export function useConnectReads(queries: Pick<Draft, 'fromQuery' | 'toQuery'>) {
  const client = useQueryClient();
  const placement = placementSource.usePlacementSources({ kind: 'items', ids: [] });
  const leftItems = webItems.useItemRows(itemQuery(queries.fromQuery), 50);
  const rightItems = webItems.useItemRows(itemQuery(queries.toQuery), 50);
  const fixtures = fixtureSource.useFixtures({
    search: queries.toQuery,
    type: null,
    withinLocationId: null,
  });
  const retry = (args: {
    side: 'left' | 'right';
    kind: 'item' | 'fixture';
    candidate: ReadStatus;
    places: ReadStatus;
  }) => {
    retryFor({
      kind: args.kind,
      candidate: args.candidate,
      places: args.places,
      item: args.side === 'left' ? leftItems.refetch : rightItems.refetch,
      fixture: fixtures.refetch,
      rooms: () => {
        void client.invalidateQueries({ queryKey: LOCATIONS_TREE_QUERY_KEY });
        void client.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
      },
      connections: () => void client.invalidateQueries({ queryKey: ['inventory', 'connections'] }),
    })();
  };
  return {
    placement,
    leftItems,
    rightItems,
    fixtures,
    connections: registry.useAllConnections(),
    mutations: registry.useConnectionMutations(),
    retry,
  };
}
type Reads = ReturnType<typeof useConnectReads>;
/** Builds the three picker option lists from the current server reads. */
export function connectOptions(
  reads: Reads,
  from: Candidate | null
): {
  fromOptions: PickOption[];
  rightItemOptions: PickOption[];
  rightFixtureOptions: PickOption[];
} {
  const world = optionsWorld(
    reads.placement.world,
    [...reads.leftItems.rows, ...reads.rightItems.rows],
    reads.placement.locations
  );
  const refusal = (to: RefusalCandidate): string | undefined =>
    from?.item === undefined
      ? undefined
      : (connectRefusal(from.item, to, reads.connections.rows) ?? undefined);
  return {
    fromOptions: itemOptions(reads.leftItems.rows, world, () => undefined),
    rightItemOptions: itemOptions(reads.rightItems.rows, world, (item) =>
      refusal({ end: { kind: 'item', itemId: item.id }, name: item.name, item })
    ),
    rightFixtureOptions: fixtureOptions(reads.fixtures.rows, reads.placement.locations, (fixture) =>
      refusal({ end: { kind: 'fixture', fixtureId: fixture.id }, name: fixture.name })
    ),
  };
}
