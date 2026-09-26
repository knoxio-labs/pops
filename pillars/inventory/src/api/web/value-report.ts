import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { items, type ItemRow } from '../../db/index.js';
import { loadItemExtras } from '../sync/wire.js';
import { readEffectiveLocations, readRooms } from './placement-scope.js';

import type { z } from 'zod';

import type {
  VALUE_REPORT_BASES,
  WebValueReportResponseSchema,
} from '../../contract/rest-web-reports.js';
import type { CommandDb } from '../../domain/commands/index.js';

type ValueReportResponse = z.infer<typeof WebValueReportResponseSchema>;
type ValueReportBasis = (typeof VALUE_REPORT_BASES)[number];

type ReportRow = Pick<
  ItemRow,
  | 'id'
  | 'name'
  | 'code'
  | 'typeId'
  | 'isContainer'
  | 'quantity'
  | 'replacementValue'
  | 'purchasePrice'
>;

interface PreparedEntry {
  readonly row: ReportRow;
  readonly replacement: number | null;
  readonly purchase: number | null;
  readonly typeKey: string | null;
  readonly typeGroup: ReportGroup;
  readonly roomGroup: ReportGroup;
  readonly hasPhoto: boolean;
}

type ReportGroup = { readonly key: string; readonly label: string };
type ReportEntry = ValueReportResponse['groups'][number]['entries'][number];

type ReportGroupAccumulator = ReportGroup & {
  value: number;
  records: number;
  unvalued: number;
  entries: ReportEntry[];
};

function multipliedValue(unitValue: number | null, quantity: number): number | null {
  return unitValue === null ? null : unitValue * quantity;
}

function valueFor(entry: PreparedEntry, basis: ValueReportBasis): number | null {
  return basis === 'replacement' ? entry.replacement : entry.purchase;
}

function groupFor(entry: PreparedEntry, grouping: 'room' | 'type'): ReportGroup {
  return grouping === 'room' ? entry.roomGroup : entry.typeGroup;
}

function roomGroupFor(
  locationId: string | null,
  rooms: ReadonlyMap<string, { readonly id: string; readonly name: string }>
): ReportGroup {
  if (locationId === null) return { key: 'in-hand', label: 'In hand' };
  const room = rooms.get(locationId);
  if (room !== undefined) return { key: room.id, label: room.name };
  return { key: 'unknown', label: 'Unknown place' };
}

function typeGroupFor(
  type: { readonly id: string; readonly label: string } | undefined
): ReportGroup {
  if (type !== undefined) return { key: type.id, label: type.label };
  return { key: 'untyped', label: 'Untyped' };
}

function compareEntries(left: ReportEntry, right: ReportEntry): number {
  const leftUnvalued = left.value === null;
  const rightUnvalued = right.value === null;
  if (leftUnvalued !== rightUnvalued) return Number(leftUnvalued) - Number(rightUnvalued);
  if (!leftUnvalued && !rightUnvalued && left.value !== right.value) {
    return (right.value ?? 0) - (left.value ?? 0);
  }
  return left.name.localeCompare(right.name);
}

function readReportRows(db: CommandDb): ReportRow[] {
  return db
    .select()
    .from(items)
    .where(
      and(
        isNull(items.deletedAt),
        eq(items.lifecycle, 'active'),
        or(eq(items.isContainer, 0), isNotNull(items.replacementValue))
      )
    )
    .all();
}

function prepareReportEntries(db: CommandDb, rows: readonly ReportRow[]): PreparedEntry[] {
  const itemIds = rows.map((row) => row.id);
  const extras = loadItemExtras(db, itemIds);
  const effectiveLocations = readEffectiveLocations(db, itemIds);
  const locationIds = [
    ...new Set(
      [...effectiveLocations.values()].filter(
        (locationId): locationId is string => locationId !== null
      )
    ),
  ];
  const rooms = readRooms(db, locationIds);
  const publishedTypes = new Map(
    (loadPublishedCatalogue(db)?.types ?? []).map((type) => [type.id, type])
  );

  return rows.map<PreparedEntry>((row) => {
    const type = row.typeId === null ? undefined : publishedTypes.get(row.typeId);
    const locationId = effectiveLocations.get(row.id) ?? null;
    return {
      row,
      replacement: multipliedValue(row.replacementValue, row.quantity),
      purchase: multipliedValue(row.purchasePrice, row.quantity),
      typeKey: type?.key ?? null,
      typeGroup: typeGroupFor(type),
      roomGroup: roomGroupFor(locationId, rooms),
      hasPhoto: (extras.photos.get(row.id)?.length ?? 0) > 0,
    };
  });
}

function readReportTotals(entries: readonly PreparedEntry[]): ValueReportResponse['totals'] {
  return entries.reduce<ValueReportResponse['totals']>(
    (result, entry) => ({
      records: result.records + 1,
      units: result.units + entry.row.quantity,
      replacement: result.replacement + (entry.replacement ?? 0),
      purchase: result.purchase + (entry.purchase ?? 0),
      unvalued: result.unvalued + (entry.replacement === null ? 1 : 0),
      withoutPhoto: result.withoutPhoto + (entry.hasPhoto ? 0 : 1),
    }),
    { records: 0, units: 0, replacement: 0, purchase: 0, unvalued: 0, withoutPhoto: 0 }
  );
}

function toReportEntry(entry: PreparedEntry, basis: ValueReportBasis): ReportEntry {
  const unitValue = basis === 'replacement' ? entry.row.replacementValue : entry.row.purchasePrice;
  return {
    itemId: entry.row.id,
    name: entry.row.name,
    code: entry.row.code,
    typeKey: entry.typeKey,
    isContainer: entry.row.isContainer === 1,
    quantity: entry.row.quantity,
    unitValue,
    value: valueFor(entry, basis),
  };
}

function accumulateGroups(
  entries: readonly PreparedEntry[],
  grouping: 'room' | 'type',
  basis: ValueReportBasis
): Map<string, ReportGroupAccumulator> {
  const groups = new Map<string, ReportGroupAccumulator>();
  for (const entry of entries) {
    const group = groupFor(entry, grouping);
    const value = valueFor(entry, basis);
    const outputEntry = toReportEntry(entry, basis);
    const current = groups.get(group.key);
    if (current !== undefined) {
      current.value += value ?? 0;
      current.records += 1;
      current.unvalued += value === null ? 1 : 0;
      current.entries.push(outputEntry);
      continue;
    }
    groups.set(group.key, {
      key: group.key,
      label: group.label,
      value: value ?? 0,
      records: 1,
      unvalued: value === null ? 1 : 0,
      entries: [outputEntry],
    });
  }
  return groups;
}

function readReportGroups(
  entries: readonly PreparedEntry[],
  grouping: 'room' | 'type',
  basis: ValueReportBasis
): ValueReportResponse['groups'] {
  const groups = accumulateGroups(entries, grouping, basis);
  const totalValue = [...groups.values()].reduce((sum, group) => sum + group.value, 0);
  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      label: group.label,
      value: group.value,
      records: group.records,
      unvalued: group.unvalued,
      share: totalValue === 0 ? 0 : group.value / totalValue,
      entries: group.entries.toSorted(compareEntries),
    }))
    .toSorted((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

/**
 * Reads the active inventory entries and groups their replacement or purchase
 * values by effective room or published catalogue type.
 */
export function readValueReport(
  db: CommandDb,
  query: { by: 'room' | 'type'; basis: 'replacement' | 'purchase' }
): z.infer<typeof WebValueReportResponseSchema> {
  const entries = prepareReportEntries(db, readReportRows(db));
  return {
    totals: readReportTotals(entries),
    groups: readReportGroups(entries, query.by, query.basis),
  };
}
