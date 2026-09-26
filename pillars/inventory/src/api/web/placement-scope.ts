import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { items, locations } from '../../db/index.js';
import { MAX_CONTAINMENT_DEPTH } from '../../domain/commands/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

const roomPathRowSchema = z.object({
  requestedId: z.string(),
  ancestorId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  depth: z.number(),
});

type RoomPathRow = z.infer<typeof roomPathRowSchema>;

/** SQL boolean over `items`: the row sits anywhere inside container `containerId`, nested boxes followed. Never true for the container itself. */
export function insideContainerSql(containerId: string): SQL {
  return sql`EXISTS (
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT child.id, 1
      FROM items AS child
      WHERE child.containing_item_id = ${containerId}
      UNION ALL
      SELECT child.id, descendants.depth + 1
      FROM items AS child
      JOIN descendants ON child.containing_item_id = descendants.id
      WHERE descendants.depth < ${MAX_CONTAINMENT_DEPTH}
    )
    SELECT 1
    FROM descendants
    WHERE descendants.id = ${items.id}
      AND descendants.id <> ${containerId}
  )`;
}

/** SQL boolean over `items`: the row sits directly in container `containerId` (`containing_item_id = containerId`). */
export function directlyInsideSql(containerId: string): SQL {
  return eq(items.containingItemId, containerId);
}

/** SQL boolean over `items`: the row's effective location is `locationId` or any descendant of it. */
export function withinLocationSql(locationId: string): SQL {
  return sql`EXISTS (
    WITH RECURSIVE
      locationScope(id, depth) AS (
        SELECT ${locationId}, 0
        UNION ALL
        SELECT child.id, locationScope.depth + 1
        FROM locations AS child
        JOIN locationScope ON child.parent_id = locationScope.id
        WHERE locationScope.depth < ${MAX_CONTAINMENT_DEPTH}
      ),
      placement(id, location_id, containing_item_id, depth) AS (
        SELECT ${items.id}, ${items.locationId}, ${items.containingItemId}, 0
        UNION ALL
        SELECT parent.id, parent.location_id, parent.containing_item_id, placement.depth + 1
        FROM items AS parent
        JOIN placement ON parent.id = placement.containing_item_id
        WHERE placement.depth < ${MAX_CONTAINMENT_DEPTH}
      )
    SELECT 1
    FROM placement
    JOIN locationScope ON locationScope.id = placement.location_id
    LIMIT 1
  )`;
}

/** SQL boolean over `items`: the row's effective location is exactly `locationId`. */
export function atEffectiveLocationSql(locationId: string): SQL {
  return sql`${effectiveLocationIdSql()} = ${locationId}`;
}

/**
 * Scalar SQL over the outer `items` row: its effective location id (TEXT), or NULL while the row,
 * or the outermost box holding it, is in hand. A correlated subquery, usable in SELECT, WHERE and ORDER BY.
 */
export function effectiveLocationIdSql(): SQL<string | null> {
  return sql<string | null>`(
    WITH RECURSIVE placement(id, location_id, containing_item_id, depth) AS (
      SELECT ${items.id}, ${items.locationId}, ${items.containingItemId}, 0
      UNION ALL
      SELECT parent.id, parent.location_id, parent.containing_item_id, placement.depth + 1
      FROM items AS parent
      JOIN placement ON parent.id = placement.containing_item_id
      WHERE placement.depth < ${MAX_CONTAINMENT_DEPTH}
    )
    SELECT placement.location_id
    FROM placement
    WHERE placement.location_id IS NOT NULL
    ORDER BY placement.depth
    LIMIT 1
  )`;
}

/** The condition for a `within` id: a live location gives `withinLocationSql`, a live container item gives `insideContainerSql`, anything else gives `null` (the caller then matches nothing). */
export function withinSql(db: CommandDb, withinId: string): SQL | null {
  const location = db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, withinId), isNull(locations.deletedAt)))
    .get();
  if (location) return withinLocationSql(withinId);

  const container = db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, withinId), eq(items.isContainer, 1), isNull(items.deletedAt)))
    .get();
  return container ? insideContainerSql(withinId) : null;
}

/** Effective location per item id, computed with `effectiveLocationIdSql`. `null` while in hand. Ids with no row are absent. */
export function readEffectiveLocations(
  db: CommandDb,
  itemIds: readonly string[]
): Map<string, string | null> {
  if (itemIds.length === 0) return new Map();

  const rows = db
    .select({ id: items.id, locationId: effectiveLocationIdSql() })
    .from(items)
    .where(inArray(items.id, [...itemIds]))
    .all();
  return new Map(rows.map((row) => [row.id, row.locationId]));
}

function roomForPath(path: readonly RoomPathRow[], homeId: string | undefined): RoomPathRow | null {
  if (path.length === 0) return null;

  if (homeId !== undefined) {
    const homeIndex = path.findIndex((node) => node.ancestorId === homeId);
    return homeIndex < 0 ? null : (path[homeIndex - 1] ?? path[homeIndex] ?? null);
  }

  const rootIndex = path.findIndex((node) => node.parentId === null);
  const root = rootIndex < 0 ? path.at(-1) : path[rootIndex];
  if (!root) return null;
  return path[path.indexOf(root) - 1] ?? root;
}

/** Room per location id. With `homeId`: the node right below `homeId` on the location's path (or `homeId` itself when the location is `homeId`); locations not under `homeId` are absent. Without `homeId`: the path's second node (the root's child), or the root when the location is a root. */
export function readRooms(
  db: CommandDb,
  locationIds: readonly string[],
  homeId?: string
): Map<string, { id: string; name: string }> {
  const requestedIds = [...new Set(locationIds)];
  if (requestedIds.length === 0) return new Map();

  const seedIds = sql.join(
    requestedIds.map((locationId) => sql`${locationId}`),
    sql`, `
  );
  const rows = roomPathRowSchema.array().parse(
    db.all(sql`
      WITH RECURSIVE path(requested_id, id, name, parent_id, depth) AS (
        SELECT start.id, start.id, start.name, start.parent_id, 0
        FROM locations AS start
        WHERE start.id IN (${seedIds})
        UNION ALL
        SELECT path.requested_id, parent.id, parent.name, parent.parent_id, path.depth + 1
        FROM locations AS parent
        JOIN path ON parent.id = path.parent_id
        WHERE path.depth < ${MAX_CONTAINMENT_DEPTH}
      )
      SELECT requested_id AS requestedId, id AS ancestorId, name, parent_id AS parentId, depth
      FROM path
      ORDER BY requested_id, depth
    `)
  );

  const paths = new Map<string, RoomPathRow[]>();
  for (const row of rows) {
    const path = paths.get(row.requestedId);
    if (path) path.push(row);
    else paths.set(row.requestedId, [row]);
  }

  const rooms = new Map<string, { id: string; name: string }>();
  for (const requestedId of requestedIds) {
    const room = roomForPath(paths.get(requestedId) ?? [], homeId);
    if (room) rooms.set(requestedId, { id: room.ancestorId, name: room.name });
  }
  return rooms;
}
