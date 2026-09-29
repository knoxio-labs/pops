import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { placementTrail } from '../../foundation/model/placement-model.js';
import { purchaseRecord } from '../../foundation/search/search-records.js';
export { PALETTE_COMMANDS } from './palette-navigation-commands.js';

import type { ItemRowModel, LocationModel, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseHit } from '../../inventory-web/purchase-model.js';
import type { InventoryPaletteCommand } from './palette-groups.js';

function detailForPlacement(world: PlacementWorld, target: PlacementTarget): string {
  return placementTrail(world, target)
    .map((segment) => segment.name)
    .join(' › ');
}

function itemDetail(world: PlacementWorld, item: ItemRowModel): string {
  const trail = detailForPlacement(world, item.placement);
  return [item.code, trail]
    .filter((value): value is string => value !== null && value !== '')
    .join(' · ');
}

/** Creates a searchable record command for one inventory item. */
export function itemRecordCommand(
  item: ItemRowModel,
  world: PlacementWorld,
  group: 'records' | 'recents' = 'records'
): InventoryPaletteCommand {
  return {
    id: item.id,
    label: item.name,
    group,
    icon: item.container === null ? INVENTORY_ICONS.item : INVENTORY_ICONS.container,
    keywords: [item.code ?? '', item.typeName ?? '', item.note ?? ''],
    detail: itemDetail(world, item),
    action: { kind: 'open-item', id: item.id },
  };
}

/** Creates a searchable record command for one inventory location. */
export function locationRecordCommand(
  location: LocationModel,
  world: PlacementWorld,
  group: 'records' | 'recents' = 'records'
): InventoryPaletteCommand {
  return {
    id: location.id,
    label: location.name,
    group,
    icon: INVENTORY_ICONS.location,
    keywords: [location.kind],
    detail: detailForPlacement(world, { kind: 'location', locationId: location.id }),
    action: { kind: 'open-location', id: location.id },
  };
}

/** Creates a searchable purchase result command for the command palette. */
export function purchaseRecordCommand(hit: PurchaseHit): InventoryPaletteCommand {
  const record = purchaseRecord(hit);
  return {
    ...record,
    keywords: [hit.merchant, hit.orderNumber ?? '', hit.matchedLine ?? ''],
    action: { kind: 'open-purchase', id: hit.id },
  };
}

/** Creates a placement argument row for an item or location target. */
export function placementArgumentCommand(
  target: Exclude<PlacementTarget, { kind: 'in-hand' }>,
  world: PlacementWorld
): InventoryPaletteCommand {
  const location = target.kind === 'location' ? world.locations.get(target.locationId) : undefined;
  const item = target.kind === 'container' ? world.items.get(target.containerId) : undefined;
  const label = location?.name ?? item?.name ?? 'Unknown destination';
  const icon = target.kind === 'location' ? INVENTORY_ICONS.location : INVENTORY_ICONS.container;
  const id =
    target.kind === 'location'
      ? `to-location-${target.locationId}`
      : `to-container-${target.containerId}`;
  return {
    id,
    label,
    group: 'records',
    icon,
    keywords: [detailForPlacement(world, target)],
    detail: detailForPlacement(world, target),
    action:
      target.kind === 'location'
        ? { kind: 'open-location', id: target.locationId }
        : { kind: 'open-item', id: target.containerId },
    target,
  };
}

/** Builds the current item's This item commands. */
export function thisItemCommands(item: ItemRowModel): InventoryPaletteCommand[] {
  const commands: InventoryPaletteCommand[] = [
    {
      id: 'this-move',
      label: `Move ${item.name}`,
      group: 'this-item',
      icon: INVENTORY_ICONS.move,
      shortcutId: 'detail-move',
      argument: 'placement',
      action: { kind: 'move', itemId: item.id },
    },
  ];

  if (item.placement.kind === 'in-hand') {
    commands.push({
      id: 'this-put-back',
      label: `Put back ${item.name}`,
      group: 'this-item',
      icon: INVENTORY_ICONS.putBack,
      shortcutId: 'detail-place',
      action: { kind: 'put-back', itemId: item.id },
    });
  } else {
    commands.push({
      id: 'this-pick-up',
      label: `Pick up ${item.name}`,
      group: 'this-item',
      icon: INVENTORY_ICONS.pickUp,
      shortcutId: 'detail-place',
      action: { kind: 'pick-up', itemId: item.id },
    });
  }

  if (item.container !== null) {
    const access = item.container.access === 'open' ? 'closed' : 'open';
    commands.push({
      id: 'this-access',
      label: `${access === 'open' ? 'Open' : 'Close'} ${item.name}`,
      group: 'this-item',
      icon: access === 'open' ? INVENTORY_ICONS.open : INVENTORY_ICONS.closed,
      shortcutId: 'detail-open-close',
      action: { kind: 'set-access', itemId: item.id, access },
    });
  }

  if (item.code !== null && item.code !== '') {
    commands.push({
      id: 'this-copy-code',
      label: `Copy code ${item.code}`,
      group: 'this-item',
      icon: INVENTORY_ICONS.code,
      shortcutId: 'detail-copy-code',
      action: { kind: 'copy-code', code: item.code },
    });
  }

  return commands;
}

/** Returns fixed placement targets in recent-first order without duplicates. */
export function uniquePlacementTargets(
  recent: readonly PlacementTarget[],
  targets: readonly Exclude<PlacementTarget, { kind: 'in-hand' }>[]
): Exclude<PlacementTarget, { kind: 'in-hand' }>[] {
  const seen = new Set<string>();
  const result: Exclude<PlacementTarget, { kind: 'in-hand' }>[] = [];
  for (const target of [...recent, ...targets]) {
    if (target.kind === 'in-hand') continue;
    const id =
      target.kind === 'location'
        ? `location:${target.locationId}`
        : `container:${target.containerId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(target);
  }
  return result;
}
