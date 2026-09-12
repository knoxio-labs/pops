/**
 * Inventory items service — CRUD operations using Drizzle ORM against the
 * per-pillar `inventory.db` handle.
 *
 * The `InventoryDb` handle is passed in explicitly to every function rather
 * than resolved via a module-global getter, keeping this service free of
 * ambient state and trivially testable with an in-memory db.
 */
import crypto from 'crypto';

import { and, count, eq, inArray, isNotNull, like, sql, sum, type SQL } from 'drizzle-orm';

import {
  containersService,
  homeInventory,
  type InventoryDb,
  locationsService,
} from '../../../db/index.js';
import { isSourceRefConflict } from '../../../db/services/source-ref-conflict.js';
import { NotFoundError } from '../../shared/errors.js';
import { buildCreateValues } from './create-builder.js';
import { buildInventoryUpdate } from './update-builder.js';

import type { CreateInventoryItemInput, InventoryRow, UpdateInventoryItemInput } from './types.js';

/** Count + rows + value aggregates for a paginated list. */
export interface InventoryListResult {
  rows: InventoryRow[];
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
  const conditions: SQL[] = [];
  if (opts.search) conditions.push(like(homeInventory.itemName, `%${opts.search}%`));
  if (opts.room) conditions.push(eq(homeInventory.room, opts.room));
  if (opts.type) conditions.push(eq(homeInventory.type, opts.type));
  if (opts.condition) {
    conditions.push(sql`lower(${homeInventory.condition}) = lower(${opts.condition})`);
  }
  if (opts.inUse !== undefined) conditions.push(eq(homeInventory.inUse, opts.inUse ? 1 : 0));
  if (opts.deductible !== undefined) {
    conditions.push(eq(homeInventory.deductible, opts.deductible ? 1 : 0));
  }
  if (opts.locationId)
    conditions.push(buildLocationCondition(db, opts.locationId, opts.includeChildren));
  if (opts.containerId) conditions.push(eq(homeInventory.containerId, opts.containerId));
  if (opts.assetId) conditions.push(eq(homeInventory.assetId, opts.assetId));
  return conditions;
}

function buildLocationCondition(
  db: InventoryDb,
  locationId: string,
  includeChildren: boolean | undefined
): SQL {
  if (!includeChildren) return eq(homeInventory.locationId, locationId);
  const descendants = locationsService.getDescendantLocationIds(db, locationId);
  return inArray(homeInventory.locationId, [locationId, ...descendants]);
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
  let query = db.select().from(homeInventory).$dynamic();
  let countQuery = db.select({ total: count() }).from(homeInventory).$dynamic();
  let sumQuery = db
    .select({
      replacementSum: sum(homeInventory.replacementValue),
      resaleSum: sum(homeInventory.resaleValue),
    })
    .from(homeInventory)
    .$dynamic();

  const where = combineConditions(buildInventoryConditions(db, opts));
  if (where) {
    query = query.where(where);
    countQuery = countQuery.where(where);
    sumQuery = sumQuery.where(where);
  }

  const rows = query.orderBy(homeInventory.itemName).limit(opts.limit).offset(opts.offset).all();
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
export function searchByAssetId(db: InventoryDb, assetId: string): InventoryRow | null {
  const [row] = db
    .select()
    .from(homeInventory)
    .where(sql`LOWER(${homeInventory.assetId}) = LOWER(${assetId})`)
    .all();
  return row ?? null;
}

/**
 * Count inventory items whose assetId starts with the given prefix (case-insensitive).
 */
export function countByAssetPrefix(db: InventoryDb, prefix: string): number {
  const [result] = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(homeInventory)
    .where(sql`LOWER(${homeInventory.assetId}) LIKE LOWER(${prefix + '%'})`)
    .all();
  return result?.count ?? 0;
}

/** Return distinct item types that exist in the database. */
export function getDistinctTypes(db: InventoryDb): string[] {
  const rows = db
    .selectDistinct({ type: homeInventory.type })
    .from(homeInventory)
    .where(isNotNull(homeInventory.type))
    .orderBy(homeInventory.type)
    .all();
  return rows.map((r) => r.type).filter((t): t is string => t !== null);
}

/** Get a single inventory item by id. Throws NotFoundError if missing. */
export function getInventoryItem(db: InventoryDb, id: string): InventoryRow {
  const [row] = db.select().from(homeInventory).where(eq(homeInventory.id, id)).all();

  if (!row) throw new NotFoundError('Inventory item', id);
  return row;
}

/** The row a given `source_ref` already names, if any. */
function getBySourceRef(db: InventoryDb, sourceRef: string): InventoryRow | undefined {
  return db.select().from(homeInventory).where(eq(homeInventory.sourceRef, sourceRef)).get();
}

/**
 * Where an item assigned to a container currently sits — the container is
 * authoritative over the item's own `locationId` while it holds it, per
 * POPS-3581: "a container sits somewhere, and its contents inherit that".
 * Throws `NotFoundError` rather than letting a bad id fall through to the
 * `container_id` foreign key and surface as an unmapped constraint error.
 */
function resolveContainerLocationId(db: InventoryDb, containerId: string): string | null {
  const container = containersService.findContainer(db, containerId);
  if (!container) throw new NotFoundError('Container', containerId);
  return containersService.getContainerCurrentLocationId(container);
}

/**
 * Create a new inventory item. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 *
 * Idempotent when `input.sourceRef` is supplied (POPS-2433): two concurrent
 * calls naming the same reference race to the insert, the loser's write
 * raises the `idx_inventory_source_ref` UNIQUE violation, and that loser
 * returns the winner's row rather than surfacing the error or minting a
 * second one. A caller with no `sourceRef` gets the old, non-idempotent
 * behaviour — a plain insert.
 */
export function createInventoryItem(
  db: InventoryDb,
  input: CreateInventoryItemInput
): InventoryRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const values = buildCreateValues(id, now, input);
  if (input.containerId) {
    values.locationId = resolveContainerLocationId(db, input.containerId);
  }

  try {
    db.insert(homeInventory).values(values).run();
  } catch (err) {
    if (typeof input.sourceRef === 'string' && input.sourceRef.length > 0) {
      const existing = isSourceRefConflict(err) ? getBySourceRef(db, input.sourceRef) : undefined;
      if (existing !== undefined) return existing;
    }
    throw err;
  }

  return getInventoryItem(db, id);
}

/**
 * Update an existing inventory item. Returns the updated row.
 */
export function updateInventoryItem(
  db: InventoryDb,
  id: string,
  input: UpdateInventoryItemInput
): InventoryRow {
  getInventoryItem(db, id);

  const updates = buildInventoryUpdate(input);
  if (updates) {
    if (input.containerId !== undefined && input.containerId !== null) {
      updates.locationId = resolveContainerLocationId(db, input.containerId);
    }
    db.update(homeInventory).set(updates).where(eq(homeInventory.id, id)).run();
  }

  return getInventoryItem(db, id);
}

/**
 * Delete an inventory item by ID. Throws NotFoundError if missing.
 */
export function deleteInventoryItem(db: InventoryDb, id: string): void {
  getInventoryItem(db, id);

  const result = db.delete(homeInventory).where(eq(homeInventory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Inventory item', id);
}
