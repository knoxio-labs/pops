import { and, asc, eq, inArray } from 'drizzle-orm';

import { itemDocuments, locations } from '../../db/index.js';
import { loadItemExtras } from '../sync/wire.js';
import { readEffectiveLocations, readRooms } from './placement-scope.js';
import { readValueReportRows } from './value-report-rows.js';

import type { z } from 'zod';

import type { WebReportEntriesResponseSchema } from '../../contract/rest-web-reports.js';
import type { CommandDb } from '../../domain/commands/index.js';

type WebReportEntriesResponse = z.infer<typeof WebReportEntriesResponseSchema>;
type WebReportEntry = WebReportEntriesResponse['entries'][number];

function readFirstReceiptIds(db: CommandDb, itemIds: readonly string[]): Map<string, number> {
  if (itemIds.length === 0) return new Map();

  const rows = db
    .select({ itemId: itemDocuments.itemId, receiptId: itemDocuments.paperlessDocumentId })
    .from(itemDocuments)
    .where(
      and(inArray(itemDocuments.itemId, [...itemIds]), eq(itemDocuments.documentType, 'receipt'))
    )
    .orderBy(asc(itemDocuments.id))
    .all();

  const firstReceiptIds = new Map<string, number>();
  for (const row of rows) {
    if (!firstReceiptIds.has(row.itemId)) firstReceiptIds.set(row.itemId, row.receiptId);
  }
  return firstReceiptIds;
}

function readPlaceNames(db: CommandDb, locationIds: readonly string[]): Map<string, string> {
  if (locationIds.length === 0) return new Map();

  return new Map(
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(inArray(locations.id, [...locationIds]))
      .all()
      .map((location) => [location.id, location.name])
  );
}

function roomFor(
  locationId: string | null,
  rooms: ReadonlyMap<string, { readonly id: string; readonly name: string }>
): WebReportEntry['room'] {
  if (locationId === null) return { key: 'in-hand', label: 'In hand' };
  const room = rooms.get(locationId);
  return room === undefined
    ? { key: 'unknown', label: 'Unknown place' }
    : { key: room.id, label: room.name };
}

function readReportEntryRows(db: CommandDb): WebReportEntry[] {
  const rows = readValueReportRows(db, 'any', { orderByName: true });
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
  const placeNames = readPlaceNames(db, locationIds);
  const firstReceiptIds = readFirstReceiptIds(db, itemIds);

  return rows.map((row) => {
    const effectiveLocationId = effectiveLocations.get(row.id) ?? null;
    return {
      itemId: row.id,
      name: row.name,
      code: row.code,
      typeKey: extras.typeKeys.get(row.id) ?? null,
      isContainer: row.isContainer === 1,
      quantity: row.quantity,
      replacementValue: row.replacementValue,
      purchasePrice: row.purchasePrice,
      purchasedOn: row.purchaseDate,
      warrantyExpires: row.warrantyExpires,
      receiptId: firstReceiptIds.get(row.id) ?? null,
      photos: extras.photos.get(row.id)?.length ?? 0,
      effectiveLocationId,
      room: roomFor(effectiveLocationId, rooms),
      place: effectiveLocationId === null ? null : (placeNames.get(effectiveLocationId) ?? null),
    };
  });
}

/** Read the active, report-counted inventory entries with provenance and placement. */
export function readReportEntries(db: CommandDb): WebReportEntriesResponse {
  return { entries: readReportEntryRows(db) };
}
