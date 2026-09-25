/**
 * Kitchen 12, packed for the move: a moving box in the garage holding a
 * dozen kitchen things and a cutlery tray with its own contents, so the
 * workspace has a real list to unpack, a nested container to count, and
 * every access and fullness combination to draw.
 */
import { buildWorld } from '@/kit/inventory/shared/placement-model';

import { coreInventory } from './core';
import { box, inBox, item } from './core-factory';
import { coreLocations } from './core-locations';
import { detailFor } from './item-states';

import type { ItemDetailModel } from '@/kit/inventory/item-detail/detail-model';
import type { ContainerAccess, ItemRowModel } from '@/kit/inventory/shared/contracts';

const K = 'type-kitchen';
const k12 = inBox('box-k12');

const packed: readonly ItemRowModel[] = [
  item(['itm-glasses', 'Wine glasses', K], k12, { quantity: 6 }),
  item(['itm-bowl', 'Salad bowl', K], k12),
  item(['itm-boards', 'Cutting boards', K], k12, { quantity: 2 }),
  item(['itm-towels', 'Tea towels', 'type-linen'], k12, { quantity: 5 }),
  item(['itm-jugs', 'Measuring jugs', K], k12, { quantity: 2 }),
  item(['itm-trays', 'Baking trays', K], k12, { quantity: 3 }),
  item(['itm-tin', 'Cake tin', K], k12),
  item(['itm-mixing', 'Mixing bowls', K], k12, { quantity: 3, sync: 'queued' }),
  item(['itm-colander', 'Colander', K], k12),
  box(['box-cutlery', 'Cutlery tray', 'type-tub'], k12, 'open'),
  item(['itm-forks', 'Forks', K], inBox('box-cutlery'), { quantity: 8 }),
  item(['itm-spoons', 'Spoons', K], inBox('box-cutlery'), { quantity: 8 }),
  item(['itm-ladles', 'Ladles', K], inBox('box-cutlery'), { quantity: 2 }),
];

/** Kitchen 12 with the given access and fullness, in a world holding its full contents. */
export function kitchen12Workspace(access: ContainerAccess, full = false): ItemDetailModel {
  const base = detailFor('box-k12');
  const container: ItemRowModel = { ...base.item, container: { access, full } };
  const others = coreInventory.filter((entry) => entry.id !== 'box-k12');
  const world = buildWorld([container, ...others, ...packed], coreLocations);
  return {
    ...base,
    item: container,
    world,
    facts: [
      { key: 'room', label: 'For room', value: 'Kitchen', origin: 'entered', inline: true },
      { key: 'packed', label: 'Packed on', value: '28 Jul 2026', origin: 'entered', inline: true },
    ],
    eventCount: 8,
  };
}

/** Ids directly inside Kitchen 12, in the order the list shows them. */
export function kitchen12Contents(model: ItemDetailModel): string[] {
  return [...model.world.items.values()]
    .filter(
      (entry) => entry.placement.kind === 'container' && entry.placement.containerId === 'box-k12'
    )
    .map((entry) => entry.id);
}

/** An open container with nothing in it yet. */
export const emptyShoebox: ItemDetailModel = (() => {
  const base = detailFor('box-shoe');
  return { ...base, item: { ...base.item, lifecycle: 'active' } };
})();
