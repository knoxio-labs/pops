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
export const browseInventory: readonly ItemRowModel[] = [
  ...coreInventory,
  ...lightingLike(),
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
export const typeOptions: readonly { value: string; label: string }[] = coreTypes.map((type) => ({
  value: type.id,
  label: type.label,
}));

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
