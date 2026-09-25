/**
 * What the reports count. Only active items count; an empty box counts only
 * when someone gave it a value, so a moving box never shows up as a gap.
 * Values are per unit, so a line of six mugs is worth six times its value.
 */
import { effectiveLocationId, locationPath } from '@/kit/inventory/foundation';

import type { ItemRowModel, PlacementWorld } from '@/kit/inventory/foundation';

/** Where an item came from and what it is worth, per unit, in whole dollars. */
export interface Provenance {
  itemId: string;
  replacementValue: number | null;
  purchasePrice: number | null;
  purchasedOn: string | null;
  merchant: string | null;
  warrantyExpires: string | null;
  /** The Paperless document holding the receipt. */
  receiptId: number | null;
  photos: number;
}

/** One item the reports count, with its provenance when it has any. */
export interface ReportEntry {
  item: ItemRowModel;
  provenance: Provenance | null;
}

/** Which value a report adds up. */
export type ValueBasis = 'replacement' | 'purchase';

/** What a breakdown groups by. */
export type BreakdownKey = 'type' | 'room';

/** The entries a report counts. */
export function reportEntries(
  world: PlacementWorld,
  provenance: readonly Provenance[]
): ReportEntry[] {
  const byItem = new Map(provenance.map((entry) => [entry.itemId, entry]));
  return [...world.items.values()].flatMap((item) => {
    if (item.lifecycle !== 'active') return [];
    const found = byItem.get(item.id) ?? null;
    if (item.container !== null && found?.replacementValue == null) return [];
    return [{ item, provenance: found }];
  });
}

/** An entry's value on a basis, times its quantity. Null when unvalued. */
export function entryValue(entry: ReportEntry, basis: ValueBasis = 'replacement'): number | null {
  const unit =
    basis === 'replacement' ? entry.provenance?.replacementValue : entry.provenance?.purchasePrice;
  return unit == null ? null : unit * entry.item.quantity;
}

/** Headline numbers for a set of entries. */
export interface ReportTotals {
  records: number;
  units: number;
  replacement: number;
  purchase: number;
  unvalued: number;
  withoutPhoto: number;
}

/** Adds up a set of entries. */
export function reportTotals(entries: readonly ReportEntry[]): ReportTotals {
  return entries.reduce<ReportTotals>(
    (sum, entry) => ({
      records: sum.records + 1,
      units: sum.units + entry.item.quantity,
      replacement: sum.replacement + (entryValue(entry) ?? 0),
      purchase: sum.purchase + (entryValue(entry, 'purchase') ?? 0),
      unvalued: sum.unvalued + (entryValue(entry) === null ? 1 : 0),
      withoutPhoto: sum.withoutPhoto + ((entry.provenance?.photos ?? 0) === 0 ? 1 : 0),
    }),
    { records: 0, units: 0, replacement: 0, purchase: 0, unvalued: 0, withoutPhoto: 0 }
  );
}

/** The room an item counts in: the first place below the property, or In hand. */
export function roomOf(world: PlacementWorld, itemId: string): { id: string; name: string } {
  const locationId = effectiveLocationId(world, itemId);
  if (locationId === null) return { id: 'in-hand', name: 'In hand' };
  const path = locationPath(world, locationId);
  const room = path[1] ?? path[0];
  return room ?? { id: 'unknown', name: 'Unknown place' };
}

/** One group of a breakdown. `share` is of the breakdown's valued total, 0 to 1. */
export interface BreakdownGroup {
  key: string;
  label: string;
  value: number;
  records: number;
  unvalued: number;
  share: number;
  entries: ReportEntry[];
}

function groupOf(entry: ReportEntry, by: BreakdownKey, world: PlacementWorld) {
  if (by === 'room') return roomOf(world, entry.item.id);
  return { id: entry.item.typeId ?? 'untyped', name: entry.item.typeName ?? 'Untyped' };
}

/**
 * Value grouped by type or room, largest first (ties by label). Entries in a
 * group are largest first too, unvalued last.
 */
export function breakdown(
  entries: readonly ReportEntry[],
  world: PlacementWorld,
  by: BreakdownKey,
  basis: ValueBasis = 'replacement'
): BreakdownGroup[] {
  const groups = new Map<string, BreakdownGroup>();
  for (const entry of entries) {
    const { id, name } = groupOf(entry, by, world);
    const group = groups.get(id) ?? {
      key: id,
      label: name,
      value: 0,
      records: 0,
      unvalued: 0,
      share: 0,
      entries: [],
    };
    const value = entryValue(entry, basis);
    group.value += value ?? 0;
    group.records += 1;
    group.unvalued += value === null ? 1 : 0;
    group.entries.push(entry);
    groups.set(id, group);
  }
  const total = [...groups.values()].reduce((sum, group) => sum + group.value, 0);
  return [...groups.values()]
    .map((group) => ({
      ...group,
      share: total === 0 ? 0 : group.value / total,
      entries: group.entries.toSorted(
        (a, b) => (entryValue(b, basis) ?? -1) - (entryValue(a, basis) ?? -1)
      ),
    }))
    .toSorted((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Whole dollars, Australian style: `$2,499`. */
export function formatDollars(value: number): string {
  return `$${Math.round(value).toLocaleString('en-AU')}`;
}
