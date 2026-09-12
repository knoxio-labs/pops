/**
 * Read-only queries for the containers slice. Mirrors
 * `locations-queries.ts`: pure reads that take a drizzle handle and
 * return rows, or throw a typed `ContainerNotFoundError` on a missed
 * lookup, kept apart from the mutating CRUD layer in `containers.ts`.
 */
import { asc, count, eq } from 'drizzle-orm';

import { ContainerNotFoundError } from '../errors.js';
import { containers, homeInventory } from '../schema.js';

import type { ContainerRow } from '../row-types.js';
import type { InventoryDb } from './internal.js';

export interface ContainerItemsResult {
  rows: (typeof homeInventory.$inferSelect)[];
  total: number;
}

export interface ListContainersOptions {
  state?: string;
}

export function getContainersList(
  db: InventoryDb,
  opts: ListContainersOptions = {}
): ContainerRow[] {
  const query = db.select().from(containers).$dynamic();
  const filtered = opts.state ? query.where(eq(containers.state, opts.state)) : query;
  return filtered.orderBy(asc(containers.createdAt), asc(containers.id)).all();
}

function fetchOne(db: InventoryDb, id: string): ContainerRow | undefined {
  return db.select().from(containers).where(eq(containers.id, id)).get();
}

/** Non-throwing lookup — callers that want a 404 mapped their own way use this. */
export function findContainer(db: InventoryDb, id: string): ContainerRow | undefined {
  return fetchOne(db, id);
}

export function getContainerOrThrow(db: InventoryDb, id: string): ContainerRow {
  const row = fetchOne(db, id);
  if (!row) throw new ContainerNotFoundError(id);
  return row;
}

export function getContainerItems(
  db: InventoryDb,
  containerId: string,
  limit: number,
  offset: number
): ContainerItemsResult {
  getContainerOrThrow(db, containerId);

  const rows = db
    .select()
    .from(homeInventory)
    .where(eq(homeInventory.containerId, containerId))
    .orderBy(homeInventory.itemName)
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db
    .select({ total: count() })
    .from(homeInventory)
    .where(eq(homeInventory.containerId, containerId))
    .all();

  return { rows, total: countResult?.total ?? 0 };
}
