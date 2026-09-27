import { Receipt, ShoppingBag } from 'lucide-react';

import { formatCents } from '@pops/ui';

import { purchaseHref } from '../../inventory-web/purchase-model';
import { INVENTORY_ICONS } from '../model/icons';
import { locationPath, placementTrail } from '../model/placement-model';

import type { PurchaseHit } from '../../inventory-web/purchase-model';
import type { RecentRecord } from '../../inventory-web/recents';
import type { PaletteCommand } from '../model/contracts';
import type { ItemRowModel, LocationModel, Placement } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';

/** A record kind that can be shown in inventory search surfaces. */
export type RecordKind = 'item' | 'place' | 'purchase';

/** Builds the stable id used by a search record entry. */
export function recordId(kind: RecordKind, id: string): string {
  return `${kind}:${id}`;
}

/** Parses a record entry id, preserving any additional colons in its id. */
export function parseRecordId(entryId: string): { kind: RecordKind; id: string } | null {
  const separator = entryId.indexOf(':');
  if (separator === -1) return null;

  const kind = entryId.slice(0, separator);
  const id = entryId.slice(separator + 1);
  if (id === '') return null;
  if (kind !== 'item' && kind !== 'place' && kind !== 'purchase') return null;
  return { kind, id };
}

/** Returns the page href for a record id, or null for a non-record id. */
export function recordHref(entryId: string): string | null {
  const record = parseRecordId(entryId);
  if (record === null) return null;

  switch (record.kind) {
    case 'item':
      return `/inventory/items/${record.id}`;
    case 'place':
      return `/inventory/locations/${record.id}`;
    case 'purchase':
      return purchaseHref(record.id);
  }
}

function withoutHouse<T extends { kind: string; id: string | null }>(
  world: PlacementWorld,
  segments: readonly T[]
): readonly T[] {
  const first = segments[0];
  if (
    segments.length > 1 &&
    first !== undefined &&
    first.id !== null &&
    world.locations.get(first.id)?.kind === 'property'
  ) {
    return segments.slice(1);
  }
  return segments;
}

/** Returns a placement trail without a leading property root when nested. */
export function trailText(world: PlacementWorld, placement: Placement): string {
  const segments = placementTrail(world, placement);
  return withoutHouse(world, segments)
    .map((segment) => segment.name)
    .join(' › ');
}

const PURCHASE_DAY = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/** Formats a purchase instant as an en-AU calendar date in UTC. */
export function purchaseDateText(date: string): string {
  return PURCHASE_DAY.format(new Date(date));
}

function nonEmpty(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => part !== null && part !== undefined && part !== '')
    .join(' · ');
}

/** Builds a palette record entry for one inventory item. */
export function itemRecord(
  item: ItemRowModel,
  world: PlacementWorld,
  group: 'records' | 'recents'
): PaletteCommand {
  return {
    id: recordId('item', item.id),
    label: item.name,
    group,
    icon: item.container === null ? INVENTORY_ICONS.item : INVENTORY_ICONS.container,
    keywords: [item.code ?? '', item.typeName ?? ''],
    detail: nonEmpty([item.code, trailText(world, item.placement)]),
  };
}

function placeParents(world: PlacementWorld, place: LocationModel): string {
  const parents = locationPath(world, place.id).slice(0, -1);
  return withoutHouse(world, parents)
    .map((location) => location.name)
    .join(' › ');
}

/** Builds a palette record entry for one inventory place. */
export function placeRecord(
  place: LocationModel,
  world: PlacementWorld,
  group: 'records' | 'recents'
): PaletteCommand {
  return {
    id: recordId('place', place.id),
    label: place.name,
    group,
    icon: INVENTORY_ICONS.location,
    detail: nonEmpty(['Place', placeParents(world, place)]),
  };
}

/** Builds a palette record entry for one purchases search hit. */
export function purchaseRecord(hit: PurchaseHit): PaletteCommand {
  const matchedLine = hit.matchedLine;
  const orderNumber = hit.orderNumber;
  const hasMatchedLine = matchedLine !== null;
  const hasOrderNumber = orderNumber !== null && orderNumber !== '';
  let label = hit.merchant;
  if (hasMatchedLine) label = matchedLine;
  else if (hasOrderNumber) label = `Order ${orderNumber}`;

  return {
    id: recordId('purchase', hit.id),
    label,
    group: 'records',
    icon: hasMatchedLine ? ShoppingBag : Receipt,
    detail: nonEmpty([
      hit.merchant,
      purchaseDateText(hit.date),
      formatCents(hit.totalCents, hit.currency),
    ]),
  };
}

/** Resolves recent item and place ids into newest-first palette entries. */
export function recentRecordEntries(
  records: readonly RecentRecord[],
  world: PlacementWorld
): PaletteCommand[] {
  return records.flatMap((record) => {
    if (record.kind === 'item') {
      const item = world.items.get(record.id);
      return item === undefined ? [] : [itemRecord(item, world, 'recents')];
    }

    const place = world.locations.get(record.id);
    return place === undefined ? [] : [placeRecord(place, world, 'recents')];
  });
}
