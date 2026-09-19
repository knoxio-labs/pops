/**
 * Locations read service.
 *
 * Each function takes an `InventoryDb` handle as its first argument; the
 * calling layer resolves the singleton or transaction handle to pass in.
 * Writes go through the command engine (`location.create`, `location.update`,
 * `location.delete`, POPS-4053); this module keeps only the read surface,
 * shared with downstream slices.
 *
 * Read helpers live in `locations-queries.ts` so this barrel stays small.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { locations } from '../schema.js';
import {
  getDeleteStats,
  getDescendantLocationIds,
  getLocationItems,
  getLocationOrThrow,
  getLocationPath,
  getLocationsList,
  type DeleteLocationStats,
  type GetLocationItemsParams,
  type LocationItemsResult,
} from './locations-queries.js';

import type { LocationRow } from '../row-types.js';
import type { InventoryDb } from './internal.js';

export type { LocationRow };

export {
  getDeleteStats,
  getDescendantLocationIds,
  getLocationItems,
  getLocationPath,
  getLocationsList,
  type DeleteLocationStats,
  type GetLocationItemsParams,
  type LocationItemsResult,
};

/** Public API shape for a location. */
export interface Location {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

/** Map a database row to the public API shape. */
export function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
  };
}

/** A location with its children, for tree responses. */
export interface LocationTreeNode extends Location {
  children: LocationTreeNode[];
}

export interface LocationListResult {
  rows: LocationRow[];
  total: number;
}

export function listLocations(db: InventoryDb): LocationListResult {
  const rows = getLocationsList(db);
  return { rows, total: rows.length };
}

export function getLocation(db: InventoryDb, id: string): LocationRow {
  return getLocationOrThrow(db, id);
}

export function getLocationTree(db: InventoryDb): LocationTreeNode[] {
  const allRows = getLocationsList(db);
  const nodeMap = new Map<string, LocationTreeNode>();
  const roots: LocationTreeNode[] = [];

  for (const row of allRows) {
    nodeMap.set(row.id, { ...toLocation(row), children: [] });
  }

  for (const row of allRows) {
    const node = nodeMap.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? nodeMap.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

export function getChildren(db: InventoryDb, parentId: string): LocationRow[] {
  return db
    .select()
    .from(locations)
    .where(and(eq(locations.parentId, parentId), isNull(locations.deletedAt)))
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .all();
}
