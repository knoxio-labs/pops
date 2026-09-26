import { inventoryCatalogueTypes } from '@/fixtures/inventory-type-catalogue';
/**
 * The population the Items and Containers browsers list: every named core
 * item plus the deterministic generated thousands, in one world so every
 * row's placement path resolves. Also the facts the Items page's banners
 * point at: a newly published type with untyped matches, and a pair of
 * likely duplicates.
 */
import { buildWorld, locationPath } from '@/kit/inventory/shared/placement-model';

import { at, coreContainers, coreInventory, coreLocations, coreTypes, item } from './core';
import { householdPopulation } from './items-population';

import type { ItemRowModel } from '@/kit/inventory/shared/model';
import type { PlacementWorld } from '@/kit/inventory/shared/placement-model';

/** Untyped items that look like the arrived type, so its banner has rows to point at. */
function lightingLike(): ItemRowModel[] {
  return [
    ['Floor lamp', 'loc-living'],
    ['Pendant light shade', 'loc-shelving'],
    ['Reading lamp', 'loc-bedroom'],
    ['LED strip light', 'loc-study'],
    ['Bedside lamp', 'loc-bedroom'],
    ['Spare globes', 'loc-hall-cupboard'],
    ['Lantern', 'loc-garage'],
  ].map(([name = '', place = ''], index) => item([`lit-${String(index)}`, name, null], at(place)));
}

/** Named items first, then a household-sized generated population. */
const typeTreeItems: readonly ItemRowModel[] = [
  item(['tree-sheet-1', 'Guest fitted sheet', 'type-sheet'], at('loc-bedroom'), {
    typeName: 'Sheet',
  }),
  item(['tree-sheet-2', 'Cotton sheet', 'type-sheet'], at('loc-bedroom'), {
    typeName: 'Sheet',
    quantity: 2,
  }),
  item(['tree-quilt-cover-1', 'Blue quilt cover', 'type-quilt-cover'], at('loc-bedroom'), {
    typeName: 'Quilt cover',
  }),
  item(['tree-pillow-1', 'Guest pillow', 'type-pillow'], at('loc-bedroom'), {
    typeName: 'Pillow',
  }),
  item(['tree-pillowcase-1', 'Linen pillowcase', 'type-pillowcase'], at('loc-bedroom'), {
    typeName: 'Pillowcase',
  }),
  item(['tree-cushion-1', 'Window cushion', 'type-cushion'], at('loc-living'), {
    typeName: 'Cushion',
  }),
];

export const browseInventory: readonly ItemRowModel[] = [
  ...coreInventory,
  ...lightingLike(),
  ...typeTreeItems,
  ...householdPopulation(520),
];

/** The world the browsers resolve placement paths against. */
export const browseWorld: PlacementWorld = buildWorld(browseInventory, coreLocations);

/** A type published elsewhere while untyped items waited for it. */
export const arrivedType = {
  id: 'type-lighting',
  label: 'Lighting',
  matchCount: 7,
  publishedBy: "Joao's iPhone",
} as const;

/** Two rows that look like the same thing filed twice: same name, same place. */
export const duplicatePair: readonly [ItemRowModel, ItemRowModel] = [
  item(['dup-a', 'Extension lead 4 way', 'type-cable'], at('loc-shelving')),
  item(['dup-b', 'Extension lead 4 way', 'type-cable'], at('loc-shelving'), { code: 'X04' }),
];

/** The items the Items page states select, in selection order. */
export const itemsSelection: readonly string[] = ['box-cables', 'itm-tv', 'itm-hdmi', 'itm-plates'];

/** A selection that sits inside boxes, so Take out is live. */
export const boxedSelection: readonly string[] = ['itm-mugs', 'itm-knife', 'itm-kettle'];

/** The Type filter's options: every published type, by label. */
export const typeOptions: readonly {
  value: string;
  label: string;
  parentTypeId: string | null;
}[] = [
  ...coreTypes.map((type) => ({
    value: type.id,
    label: type.label,
    parentTypeId: type.parentTypeId,
  })),
  ...inventoryCatalogueTypes.map((type) => ({
    value: type.id,
    label: type.label,
    parentTypeId: type.parentTypeId,
  })),
];

const pathLabel = (id: string): string =>
  locationPath(browseWorld, id)
    .filter((node) => node.parentId !== null || node.id === id)
    .map((node) => node.name)
    .join(' › ');

/** The Where filter's options: every place by its path, then every container. */
export const placeOptions: readonly { value: string; label: string }[] = [
  ...coreLocations.map((node) => ({ value: node.id, label: pathLabel(node.id) })),
  ...coreContainers
    .filter((entry) => entry.lifecycle === 'active')
    .map((entry) => ({ value: entry.id, label: `${entry.name} (container)` })),
];
