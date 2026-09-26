/**
 * The insurance schedule: counted items grouped by room with a subtotal
 * each, optionally limited to one place and everything under it, or to the
 * gaps an insurer would ask about (no value, no photo). The CSV carries the
 * same rows in the same order, one line per record, quantities kept.
 */
import { effectiveLocationId, isLocationWithin, locationPath } from '@/kit/inventory/foundation';

import { entryValue, roomOf } from './report-model';

import type { PlacementWorld } from '@/kit/inventory/foundation';

import type { ReportEntry } from './report-model';

/** How rows sort inside a room. */
export type InsuranceSort = 'value' | 'name';

/** What the schedule shows. */
export interface InsuranceOptions {
  /** A location; null is the whole house. */
  scopeId: string | null;
  sort: InsuranceSort;
  /** Only rows missing a value or a photo. */
  gapsOnly: boolean;
}

/** One room of the schedule. */
export interface InsuranceGroup {
  roomId: string;
  room: string;
  subtotal: number;
  entries: ReportEntry[];
}

/** Whether an insurer would ask about this row. */
export function hasGap(entry: ReportEntry): boolean {
  return entryValue(entry) === null || (entry.provenance?.photos ?? 0) === 0;
}

function inScope(entry: ReportEntry, world: PlacementWorld, scopeId: string | null): boolean {
  if (scopeId === null) return true;
  const locationId = effectiveLocationId(world, entry.item.id);
  return locationId !== null && isLocationWithin(world, locationId, scopeId);
}

function compare(sort: InsuranceSort) {
  return (a: ReportEntry, b: ReportEntry) =>
    sort === 'name'
      ? a.item.name.localeCompare(b.item.name)
      : (entryValue(b) ?? -1) - (entryValue(a) ?? -1) || a.item.name.localeCompare(b.item.name);
}

/** Rooms in name order, In hand last; rows sorted within each room. */
export function insuranceGroups(
  entries: readonly ReportEntry[],
  world: PlacementWorld,
  options: InsuranceOptions
): InsuranceGroup[] {
  const groups = new Map<string, InsuranceGroup>();
  for (const entry of entries) {
    if (!inScope(entry, world, options.scopeId)) continue;
    if (options.gapsOnly && !hasGap(entry)) continue;
    const room = roomOf(world, entry.item.id);
    const group = groups.get(room.id) ?? {
      roomId: room.id,
      room: room.name,
      subtotal: 0,
      entries: [],
    };
    group.subtotal += entryValue(entry) ?? 0;
    group.entries.push(entry);
    groups.set(room.id, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, entries: group.entries.toSorted(compare(options.sort)) }))
    .toSorted((a, b) => {
      if (a.roomId === 'in-hand' || b.roomId === 'in-hand') return a.roomId === 'in-hand' ? 1 : -1;
      return a.room.localeCompare(b.room);
    });
}

function cell(value: string): string {
  return /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const HEADER = [
  'Room',
  'Place',
  'Item',
  'Code',
  'Quantity',
  'Unit value',
  'Total value',
  'Purchased',
  'Warranty ends',
  'Receipt',
  'Photos',
];

const blankIfNull = (value: number | string | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

function csvRow(room: string, entry: ReportEntry, world: PlacementWorld): string[] {
  const { item, provenance } = entry;
  const locationId = effectiveLocationId(world, item.id);
  const place = locationId === null ? undefined : locationPath(world, locationId).at(-1)?.name;
  return [
    room,
    place ?? '',
    item.name,
    item.code ?? '',
    String(item.quantity),
    blankIfNull(provenance?.replacementValue),
    blankIfNull(entryValue(entry)),
    blankIfNull(provenance?.purchasedOn),
    blankIfNull(provenance?.warrantyExpires),
    blankIfNull(provenance?.receiptId),
    String(provenance?.photos ?? 0),
  ];
}

/** The schedule as CSV. Blank cells mean unknown; receipts are Paperless document numbers. */
export function insuranceCsv(groups: readonly InsuranceGroup[], world: PlacementWorld): string {
  const rows = groups.flatMap((group) =>
    group.entries.map((entry) => csvRow(group.room, entry, world).map(cell).join(','))
  );
  return [HEADER.join(','), ...rows].join('\n');
}
