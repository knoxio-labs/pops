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

/** Who a `code` is held by, case-insensitively, tombstoned or not (POPS-4053/4124). */
export interface CodeHolder {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: string | null;
}

/**
 * The item already holding `code` (case-insensitive), if any, so a legacy
 * create/update route that hits `items.code`'s unique index can report a
 * clean 409 naming whether the holder is a deleted item rather than letting
 * the raw constraint violation surface as a 500 (POPS-4053).
 */
export function findCodeHolder(db: InventoryDb, code: string): CodeHolder | undefined {
  return db
    .select({ id: items.id, name: items.name, deletedAt: items.deletedAt })
    .from(items)
    .where(sql`LOWER(${items.code}) = LOWER(${code})`)
    .get();
}

/**
 * Whether `id` names a tombstoned item, `undefined` when it names no item at
 * all. Used to word a `code_collision`'s 409 message: the holder an
 * `item.setCode` conflict names is only an id and a name, not whether it is
 * live (POPS-4053).
 */
export function isItemDeleted(db: InventoryDb, id: string): boolean | undefined {
  const row = db.select({ deletedAt: items.deletedAt }).from(items).where(eq(items.id, id)).get();
  return row ? row.deletedAt != null : undefined;
}

/**
 * Count inventory items whose assetId starts with the given prefix
 * (case-insensitive), deleted items included (POPS-4053): `items.code`
 * stays held by a deleted item (POPS-4124), so an id the web app's counter
 * skipped counting could still collide with one. Undercounting here is what
 * used to make the counter suggest an id already held by a tombstoned item.
 */
export function countByAssetPrefix(db: InventoryDb, prefix: string): number {
  const [result] = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(items)
    .where(sql`LOWER(${items.code}) LIKE LOWER(${prefix + '%'})`)
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

/**
 * The LIVE row a given `source_ref` already names, if any (POPS-4053):
 * `items_source_ref` is unique only among live rows, so a ref held solely by
 * a deleted item has no live holder here, and a fan-out caller (purchases)
 * must never be handed a tombstoned row back from a create.
 */
export function getBySourceRef(db: InventoryDb, sourceRef: string): ItemRow | undefined {
  return db
    .select()
    .from(items)
    .where(and(eq(items.sourceRef, sourceRef), isNull(items.deletedAt)))
    .get();
}
