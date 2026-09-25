/**
 * Inventory search as iOS universal search ranks it: an exact code is
 * pinned first (code lookup without a scanner), then names that start with
 * the query, then names that contain it, then matches in other fields and
 * in places. Every hit says which field matched, so a result that does not
 * show the query in its name still explains itself.
 */
import { placementTrail, rankMatch } from '../foundation';
import { sitsWithin } from '../items-list/browse-model';

import type { ItemRowModel, LocationModel, PlacementWorld } from '../foundation';

/** How strongly a hit matched, strongest first. */
export type MatchTier = 'prefix' | 'contains' | 'other';

/** The field an `other` hit matched in. */
export type MatchField = 'code' | 'note' | 'type' | 'place';

/** An item or container that matched. */
export interface ItemHit {
  kind: 'item';
  item: ItemRowModel;
  tier: MatchTier;
  field: MatchField | null;
}

/** A location that matched by name. */
export interface PlaceHit {
  kind: 'place';
  place: LocationModel;
  tier: MatchTier;
}

/** The Type and Placement filters (spec 1.3). */
export interface SearchFilters {
  typeId: string | null;
  within: string | null;
}

/** No filters. */
export const NO_SEARCH_FILTERS: SearchFilters = { typeId: null, within: null };

/** A query's results, grouped as the page draws them. */
export interface InventoryResults {
  exact: ItemRowModel | null;
  items: ItemHit[];
  places: PlaceHit[];
}

const TIER_RANK: Readonly<Record<MatchTier, number>> = { prefix: 3, contains: 2, other: 1 };

function normalise(text: string): string {
  return text.trim().toLowerCase();
}

/** The item whose code is exactly the query, ignoring case: the scan-free lookup. */
export function exactCode(items: Iterable<ItemRowModel>, query: string): ItemRowModel | null {
  const q = normalise(query);
  if (q === '') return null;
  for (const item of items) if (item.code !== null && normalise(item.code) === q) return item;
  return null;
}

function otherField(world: PlacementWorld, item: ItemRowModel, q: string): MatchField | null {
  if (rankMatch(q, item.code ?? '') > 1) return 'code';
  if (rankMatch(q, item.note ?? '') > 1) return 'note';
  if (rankMatch(q, item.typeName ?? '') > 1) return 'type';
  const trail = placementTrail(world, item.placement);
  return trail.some((segment) => rankMatch(q, segment.name) > 1) ? 'place' : null;
}

function itemHit(world: PlacementWorld, item: ItemRowModel, q: string): ItemHit | null {
  const name = rankMatch(q, item.name);
  if (name === 3) return { kind: 'item', item, tier: 'prefix', field: null };
  if (name === 2) return { kind: 'item', item, tier: 'contains', field: null };
  const field = otherField(world, item, q);
  return field === null ? null : { kind: 'item', item, tier: 'other', field };
}

function passes(world: PlacementWorld, item: ItemRowModel, filters: SearchFilters): boolean {
  if (filters.typeId !== null && item.typeId !== filters.typeId) return false;
  return filters.within === null || sitsWithin(world, item, filters.within);
}

function byTier(a: ItemHit, b: ItemHit): number {
  const active = (hit: ItemHit) => (hit.item.lifecycle === 'active' ? 0 : 1);
  return (
    TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
    active(a) - active(b) ||
    a.item.name.localeCompare(b.item.name)
  );
}

function placeHits(world: PlacementWorld, q: string, filters: SearchFilters): PlaceHit[] {
  if (filters.typeId !== null) return [];
  return [...world.locations.values()]
    .map((place) => ({ place, rank: rankMatch(q, place.name) }))
    .filter(({ rank }) => rank >= 2)
    .toSorted((a, b) => b.rank - a.rank || a.place.name.localeCompare(b.place.name))
    .map(({ place, rank }) => ({ kind: 'place', place, tier: rank === 3 ? 'prefix' : 'contains' }));
}

/** Searches the inventory. An empty query returns nothing: the page shows recents instead. */
export function searchInventory(
  world: PlacementWorld,
  query: string,
  filters: SearchFilters = NO_SEARCH_FILTERS
): InventoryResults {
  const q = query.trim();
  if (q === '') return { exact: null, items: [], places: [] };
  const exact = exactCode(world.items.values(), q);
  const items = [...world.items.values()]
    .filter((item) => item.id !== exact?.id && passes(world, item, filters))
    .flatMap((item) => itemHit(world, item, q) ?? [])
    .toSorted(byTier);
  return { exact, items, places: placeHits(world, q, filters) };
}

/** Item hits split as the page draws them: name matches, then matches elsewhere. */
export function splitHits(items: readonly ItemHit[]): { byName: ItemHit[]; elsewhere: ItemHit[] } {
  return {
    byName: items.filter((hit) => hit.tier !== 'other'),
    elsewhere: items.filter((hit) => hit.tier === 'other'),
  };
}

/**
 * Every result id in the order the page draws and the keyboard walks them:
 * the exact code, items matched by name, places matched by name, then items
 * matched only in another field or by where they sit.
 */
export function resultOrder(results: InventoryResults): string[] {
  const { byName, elsewhere } = splitHits(results.items);
  return [
    ...(results.exact ? [results.exact.id] : []),
    ...byName.map((hit) => hit.item.id),
    ...results.places.map((hit) => hit.place.id),
    ...elsewhere.map((hit) => hit.item.id),
  ];
}

/** How many results a query found, for the scope chip's count. */
export function resultCount(results: InventoryResults): number {
  return (results.exact ? 1 : 0) + results.items.length + results.places.length;
}

/**
 * The next active row for a key step: clamps at both ends rather than
 * wrapping, and starts from the top when nothing is active or the active
 * row has left the results.
 */
export function stepActive(
  order: readonly string[],
  activeId: string | null,
  delta: number
): string | null {
  if (order.length === 0) return null;
  const index = activeId === null ? -1 : order.indexOf(activeId);
  if (index === -1) return order[0] ?? null;
  return order[Math.min(order.length - 1, Math.max(0, index + delta))] ?? null;
}
