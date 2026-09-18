/**
 * Inventory items read service, using Drizzle ORM against the per-pillar
 * `inventory.db` handle. Every read here excludes a tombstoned row, since
 * `item.delete` (POPS-4053) marks `deleted_at` rather than removing the row.
 * The legacy `/items` routes' writes go through the command layer
 * (`../../domain/commands`) instead of this module.
 *
 * The `InventoryDb` handle is passed in explicitly to every function rather
 * than resolved via a module-global getter, keeping this service free of
 * ambient state and trivially testable with an in-memory db.
 */
import { and, count, eq, inArray, isNotNull, isNull, like, sql, sum, type SQL } from 'drizzle-orm';

import { items, type InventoryDb, locationsService } from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';

import type { ItemRow } from './types.js';

/** Count + rows + value aggregates for a paginated list. */
export interface InventoryListResult {
  rows: ItemRow[];
  total: number;
  totalReplacementValue: number;
  totalResaleValue: number;
}

/** Options for listing inventory items. */
export interface ListInventoryItemsOptions {
  search?: string;
  room?: string;
  type?: string;
  condition?: string;
  inUse?: boolean;
  deductible?: boolean;
  limit: number;
  offset: number;
  locationId?: string;
  containerId?: string;
  assetId?: string;
  includeChildren?: boolean;
}

function buildInventoryConditions(db: InventoryDb, opts: ListInventoryItemsOptions): SQL[] {
  const conditions: SQL[] = [isNull(items.deletedAt)];
  if (opts.search) conditions.push(like(items.name, `%${opts.search}%`));
  if (opts.room) conditions.push(eq(items.room, opts.room));
  if (opts.type) conditions.push(eq(items.legacyType, opts.type));
  if (opts.condition) {
    conditions.push(sql`lower(${items.condition}) = lower(${opts.condition})`);
  }
  if (opts.inUse !== undefined) conditions.push(eq(items.inUse, opts.inUse ? 1 : 0));
  if (opts.deductible !== undefined) {
    conditions.push(eq(items.deductible, opts.deductible ? 1 : 0));
  }
  if (opts.locationId)
    conditions.push(buildLocationCondition(db, opts.locationId, opts.includeChildren));
  if (opts.containerId) conditions.push(eq(items.containingItemId, opts.containerId));
  if (opts.assetId) conditions.push(eq(items.code, opts.assetId));
  return conditions;
}

function buildLocationCondition(
  db: InventoryDb,
  locationId: string,
  includeChildren: boolean | undefined
): SQL {
  if (!includeChildren) return eq(items.locationId, locationId);
  const descendants = locationsService.getDescendantLocationIds(db, locationId);
  return inArray(items.locationId, [locationId, ...descendants]);
}

function combineConditions(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

/** List inventory items with optional filters. */
export function listInventoryItems(
  db: InventoryDb,
  opts: ListInventoryItemsOptions
): InventoryListResult {
  let query = db.select().from(items).$dynamic();
  let countQuery = db.select({ total: count() }).from(items).$dynamic();
  let sumQuery = db
    .select({
      replacementSum: sum(items.replacementValue),
      resaleSum: sum(items.resaleValue),
    })
    .from(items)
    .$dynamic();

  const where = combineConditions(buildInventoryConditions(db, opts));
  if (where) {
    query = query.where(where);
    countQuery = countQuery.where(where);
    sumQuery = sumQuery.where(where);
  }

  const rows = query.orderBy(items.name).limit(opts.limit).offset(opts.offset).all();
  const [countResult] = countQuery.all();
  const [sumResult] = sumQuery.all();

  return {
    rows,
    total: countResult?.total ?? 0,
    totalReplacementValue: Number(sumResult?.replacementSum) || 0,
    totalResaleValue: Number(sumResult?.resaleSum) || 0,
  };
}

/**
 * Search for an inventory item by exact asset ID (case-insensitive).
 * Returns the item or null if not found.
 */
export function searchByAssetId(db: InventoryDb, assetId: string): ItemRow | null {
  const [row] = db
    .select()
    .from(items)
    .where(and(sql`LOWER(${items.code}) = LOWER(${assetId})`, isNull(items.deletedAt)))
    .all();
  return row ?? null;
}

/**
 * Count inventory items whose assetId starts with the given prefix (case-insensitive).
 */
export function countByAssetPrefix(db: InventoryDb, prefix: string): number {
  const [result] = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(items)
    .where(and(sql`LOWER(${items.code}) LIKE LOWER(${prefix + '%'})`, isNull(items.deletedAt)))
    .all();
  return result?.count ?? 0;
}

/** Return distinct item types that exist in the database. */
export function getDistinctTypes(db: InventoryDb): string[] {
  const rows = db
    .selectDistinct({ type: items.legacyType })
    .from(items)
    .where(and(isNotNull(items.legacyType), isNull(items.deletedAt)))
    .orderBy(items.legacyType)
    .all();
  return rows.map((r) => r.type).filter((t): t is string => t !== null);
}

/**
 * Get a single, non-tombstoned inventory item by id. Throws NotFoundError
 * when missing or already deleted: the legacy routes hard-deleted a row, so
 * a tombstone left by `item.delete` (POPS-4053) has to look the same as
 * gone.
 */
export function getInventoryItem(db: InventoryDb, id: string): ItemRow {
  const [row] = db
    .select()
    .from(items)
    .where(and(eq(items.id, id), isNull(items.deletedAt)))
    .all();

  if (!row) throw new NotFoundError('Inventory item', id);
  return row;
}

/** The row a given `source_ref` already names, if any, tombstoned or not. */
export function getBySourceRef(db: InventoryDb, sourceRef: string): ItemRow | undefined {
  return db.select().from(items).where(eq(items.sourceRef, sourceRef)).get();
}
