import { isLocationWithin } from '../../foundation/model/placement-model.js';
import { toCsv } from './report-model.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';

/** The row ordering used by the insurance schedule. */
export type InsuranceSort = 'value' | 'name';

/** The URL-backed insurance schedule filters. */
export interface InsuranceOptions {
  scopeId: string | null;
  sort: InsuranceSort;
  gapsOnly: boolean;
}

/** One room of the insurance schedule. */
export interface InsuranceGroup {
  roomId: string;
  room: string;
  subtotal: number;
  entries: ReportEntry[];
}

/** Returns replacement value times quantity, or null when the entry is unvalued. */
export function entryValue(entry: ReportEntry): number | null {
  return entry.replacementValue === null ? null : entry.replacementValue * entry.quantity;
}

/** Returns whether an entry is missing a replacement value or photo. */
export function hasGap(entry: ReportEntry): boolean {
  return entryValue(entry) === null || entry.photos === 0;
}

function inScope(entry: ReportEntry, world: PlacementWorld, scopeId: string | null): boolean {
  if (scopeId === null) return true;
  const locationId = entry.effectiveLocationId;
  return locationId !== null && isLocationWithin(world, locationId, scopeId);
}

function compareEntries(sort: InsuranceSort) {
  return (left: ReportEntry, right: ReportEntry): number => {
    if (sort === 'name') return left.name.localeCompare(right.name);
    return (
      (entryValue(right) ?? -1) - (entryValue(left) ?? -1) || left.name.localeCompare(right.name)
    );
  };
}

function isInHand(group: InsuranceGroup): boolean {
  return group.roomId === 'in-hand' || group.room.toLocaleLowerCase() === 'in hand';
}

/** Groups in-scope entries by room and sorts rooms and rows for display. */
export function insuranceGroups(
  entries: readonly ReportEntry[],
  world: PlacementWorld,
  options: InsuranceOptions
): InsuranceGroup[] {
  const groups = new Map<string, InsuranceGroup>();
  for (const entry of entries) {
    if (!inScope(entry, world, options.scopeId)) continue;
    if (options.gapsOnly && !hasGap(entry)) continue;
    const group = groups.get(entry.room.key) ?? {
      roomId: entry.room.key,
      room: entry.room.label,
      subtotal: 0,
      entries: [],
    };
    group.subtotal += entryValue(entry) ?? 0;
    group.entries.push(entry);
    groups.set(entry.room.key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: group.entries.toSorted(compareEntries(options.sort)),
    }))
    .toSorted((left, right) => {
      if (isInHand(left) || isInHand(right)) return isInHand(left) ? 1 : -1;
      return left.room.localeCompare(right.room);
    });
}

function blankIfNull(value: number | string | null): string {
  return value === null ? '' : String(value);
}

/** Serializes the visible insurance groups in the same order as the schedule. */
export function insuranceCsv(groups: readonly InsuranceGroup[]): string {
  const header = [
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
  const records = groups.flatMap((group) =>
    group.entries.map((entry) => [
      group.room,
      entry.place ?? '',
      entry.name,
      entry.code ?? '',
      String(entry.quantity),
      blankIfNull(entry.replacementValue),
      blankIfNull(entryValue(entry)),
      entry.purchasedOn ?? '',
      entry.warrantyExpires ?? '',
      blankIfNull(entry.receiptId),
      String(entry.photos),
    ])
  );
  return toCsv(header, records);
}

/** Parses the supported insurance controls from the current URL. */
export function parseInsuranceOptions(params: URLSearchParams): InsuranceOptions {
  const locationId = params.get('locationId');
  return {
    scopeId: locationId === null || locationId === '' ? null : locationId,
    sort: params.get('sort') === 'name' ? 'name' : 'value',
    gapsOnly: params.get('gaps') === '1',
  };
}

/** Writes only non-default insurance controls in their canonical URL order. */
export function insuranceSearch(options: InsuranceOptions): string {
  const params = new URLSearchParams();
  if (options.scopeId !== null) params.set('locationId', options.scopeId);
  if (options.gapsOnly) params.set('gaps', '1');
  if (options.sort === 'name') params.set('sort', 'name');
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
