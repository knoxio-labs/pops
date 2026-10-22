import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { loadPublishedCatalogue, PARTS_CAPABILITY } from '../../../catalogue/index.js';
import { itemParts, items, locations, type InventoryDb } from '../../../db/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';

/** The deepest assembly chain the cycle check walks before refusing. */
export const MAX_ASSEMBLY_DEPTH = 16;

/** An item named by an assembly relation. */
export interface ItemRef {
  readonly itemId: string;
  readonly name: string;
  readonly code: string | null;
}

/** Where a part currently sits, resolved to names for display. */
export interface PartPlacement {
  readonly kind: 'location' | 'container' | 'hand';
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly containingItemId: string | null;
  readonly containingItemName: string | null;
}

/** One part of an assembly. */
export interface PartSummary extends ItemRef {
  readonly typeId: string | null;
  readonly lifecycle: string;
  readonly placement: PartPlacement;
}

/** An item's place in the assembly tree. */
export interface ItemPartsView {
  readonly canHaveParts: boolean;
  readonly assembly: ItemRef | null;
  readonly parts: PartSummary[];
}

type ItemRow = typeof items.$inferSelect;

function liveItem(db: InventoryDb, itemId: string): ItemRow {
  const row = db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), isNull(items.deletedAt)))
    .get();
  if (!row) throw new NotFoundError('Inventory item', itemId);
  return row;
}

function grantsParts(db: InventoryDb, typeId: string | null): boolean {
  if (typeId === null) return false;
  const type = loadPublishedCatalogue(db)?.types.find((entry) => entry.id === typeId);
  return type?.effectiveCapabilities.includes(PARTS_CAPABILITY) ?? false;
}

/** The live assembly `itemId` is a part of; a link to a deleted assembly counts as none. */
function assemblyOf(db: InventoryDb, itemId: string): string | null {
  return (
    db
      .select({ assemblyItemId: itemParts.assemblyItemId })
      .from(itemParts)
      .innerJoin(items, eq(items.id, itemParts.assemblyItemId))
      .where(and(eq(itemParts.partItemId, itemId), isNull(items.deletedAt)))
      .get()?.assemblyItemId ?? null
  );
}

function assertNoCycle(db: InventoryDb, assemblyItemId: string, partItemId: string): void {
  let current: string | null = assemblyItemId;
  for (let depth = 0; current !== null; depth += 1) {
    if (current === partItemId) {
      throw new ConflictError(
        `Item '${partItemId}' already contains '${assemblyItemId}' as a part; an item cannot be a part of itself`
      );
    }
    if (depth >= MAX_ASSEMBLY_DEPTH) {
      throw new ConflictError(`Assemblies cannot nest deeper than ${MAX_ASSEMBLY_DEPTH} levels`);
    }
    current = assemblyOf(db, current);
  }
}

function toRef(row: Pick<ItemRow, 'id' | 'name' | 'code'>): ItemRef {
  return { itemId: row.id, name: row.name, code: row.code };
}

function nameMap(
  db: InventoryDb,
  table: typeof items | typeof locations,
  ids: readonly string[]
): Map<string, string> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(inArray(table.id, [...new Set(ids)]))
    .all();
  return new Map(rows.map((row) => [row.id, row.name]));
}

function listParts(db: InventoryDb, assemblyItemId: string): PartSummary[] {
  const rows = db
    .select({ item: items })
    .from(itemParts)
    .innerJoin(items, eq(items.id, itemParts.partItemId))
    .where(and(eq(itemParts.assemblyItemId, assemblyItemId), isNull(items.deletedAt)))
    .orderBy(asc(items.name), asc(items.id))
    .all()
    .map(({ item }) => item);
  const locationNames = nameMap(
    db,
    locations,
    rows.flatMap((row) => (row.locationId === null ? [] : [row.locationId]))
  );
  const containerNames = nameMap(
    db,
    items,
    rows.flatMap((row) => (row.containingItemId === null ? [] : [row.containingItemId]))
  );
  return rows.map((row) => ({
    ...toRef(row),
    typeId: row.typeId,
    lifecycle: row.lifecycle,
    placement: {
      kind: row.placementKind,
      locationId: row.locationId,
      locationName: row.locationId === null ? null : (locationNames.get(row.locationId) ?? null),
      containingItemId: row.containingItemId,
      containingItemName:
        row.containingItemId === null ? null : (containerNames.get(row.containingItemId) ?? null),
    },
  }));
}

/**
 * Read an item's assembly (what it is a part of) and its parts. Parts are
 * listed even when the item's type no longer grants the capability, so a
 * retyped assembly can still be emptied.
 */
export function getItemParts(db: InventoryDb, itemId: string): ItemPartsView {
  const item = liveItem(db, itemId);
  const assemblyId = assemblyOf(db, itemId);
  const assemblyRow =
    assemblyId === null
      ? undefined
      : db
          .select({ id: items.id, name: items.name, code: items.code })
          .from(items)
          .where(eq(items.id, assemblyId))
          .get();
  return {
    canHaveParts: grantsParts(db, item.typeId),
    assembly: assemblyRow ? toRef(assemblyRow) : null,
    parts: listParts(db, itemId),
  };
}

/**
 * Make `partItemId` a part of `assemblyItemId`. The assembly's type must grant
 * the `parts` capability. An item is a part of at most one assembly and never
 * of itself or its own parts. Re-adding the same pair is a no-op.
 */
export function addPart(
  db: InventoryDb,
  assemblyItemId: string,
  partItemId: string
): ItemPartsView {
  const assembly = liveItem(db, assemblyItemId);
  liveItem(db, partItemId);
  if (assemblyItemId === partItemId) {
    throw new ConflictError('An item cannot be a part of itself');
  }
  if (!grantsParts(db, assembly.typeId)) {
    throw new ConflictError(
      `Item '${assemblyItemId}' cannot have parts: its type does not grant the parts capability`
    );
  }
  const current = assemblyOf(db, partItemId);
  if (current !== null && current !== assemblyItemId) {
    throw new ConflictError(
      `Item '${partItemId}' is already a part of '${current}'; remove it there first`
    );
  }
  if (current === null) {
    assertNoCycle(db, assemblyItemId, partItemId);
    db.insert(itemParts)
      .values({ partItemId, assemblyItemId })
      .onConflictDoUpdate({ target: itemParts.partItemId, set: { assemblyItemId } })
      .run();
  }
  return getItemParts(db, assemblyItemId);
}

/** Stop `partItemId` being a part of `assemblyItemId`; 404 when it is not one. */
export function removePart(
  db: InventoryDb,
  assemblyItemId: string,
  partItemId: string
): ItemPartsView {
  liveItem(db, assemblyItemId);
  const removed = db
    .delete(itemParts)
    .where(and(eq(itemParts.partItemId, partItemId), eq(itemParts.assemblyItemId, assemblyItemId)))
    .run();
  if (removed.changes === 0) {
    throw new NotFoundError('Item part', `${assemblyItemId}/${partItemId}`);
  }
  return getItemParts(db, assemblyItemId);
}
