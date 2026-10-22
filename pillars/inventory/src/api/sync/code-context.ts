import { desc, isNotNull, isNull } from 'drizzle-orm';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { items, locations } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/** How many existing codes one suggestion request shows the model, newest first. */
export const MAX_CONTEXT_CODES = 500;

/** One code already in use, described the way the model reads it. */
export interface ContextCode {
  readonly code: string;
  readonly name: string;
  readonly typeKey?: string;
  readonly place?: string;
}

/** Where the new item is going: a location path and, optionally, a container. */
export interface CodeDestination {
  readonly path: readonly string[];
  readonly container?: { readonly name: string; readonly code?: string };
}

/** Everything inventory knows that could shape a good code for a new item. */
export interface CodeSuggestionContext {
  readonly item: { readonly name: string; readonly typeKey?: string; readonly typeLabel?: string };
  readonly destination?: CodeDestination;
  readonly existing: readonly ContextCode[];
  readonly stem?: string;
}

/** The request fields the context is built from. */
export interface CodeContextRequest {
  readonly name: string;
  readonly typeKey?: string;
  readonly locationId?: string;
  readonly containerId?: string;
  readonly stem?: string;
}

interface PlaceRow {
  readonly name: string;
  readonly code: string | null;
  readonly locationId: string | null;
}

function locationPaths(db: CommandDb): (id: string | null) => string[] {
  const rows = db
    .select({ id: locations.id, name: locations.name, parentId: locations.parentId })
    .from(locations)
    .where(isNull(locations.deletedAt))
    .all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (id) => {
    const path: string[] = [];
    const seen = new Set<string>();
    let cursor = id === null ? undefined : byId.get(id);
    while (cursor !== undefined && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      path.unshift(cursor.name);
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    return path;
  };
}

function containerPlaces(db: CommandDb): Map<string, PlaceRow> {
  const rows = db
    .select({
      id: items.id,
      name: items.name,
      code: items.code,
      locationId: items.locationId,
      isContainer: items.isContainer,
    })
    .from(items)
    .where(isNull(items.deletedAt))
    .all();
  return new Map(rows.filter((row) => row.isContainer === 1).map((row) => [row.id, row]));
}

function typeLookup(db: CommandDb): Map<string, { key: string; label: string }> {
  const types = loadPublishedCatalogue(db)?.types ?? [];
  return new Map(types.map((type) => [type.id, { key: type.key, label: type.label }]));
}

function joinPlace(path: readonly string[], container?: PlaceRow): string | undefined {
  const parts = container === undefined ? [...path] : [...path, container.name];
  return parts.length === 0 ? undefined : parts.join(' > ');
}

function destinationFor(
  request: CodeContextRequest,
  pathOf: (id: string | null) => string[],
  containers: Map<string, PlaceRow>
): CodeDestination | undefined {
  const container =
    request.containerId === undefined ? undefined : containers.get(request.containerId);
  if (container !== undefined) {
    return {
      path: pathOf(container.locationId),
      container: {
        name: container.name,
        ...(container.code === null ? {} : { code: container.code }),
      },
    };
  }
  if (request.locationId === undefined) return undefined;
  const path = pathOf(request.locationId);
  return path.length === 0 ? undefined : { path };
}

/**
 * Collect the context a code suggestion is made from: the new item, where it
 * is going, and up to {@link MAX_CONTEXT_CODES} live codes with the item,
 * type and place behind each. Unknown location or container IDs are ignored
 * rather than refused, so a stale form still gets a suggestion.
 */
export function buildCodeContext(
  db: CommandDb,
  request: CodeContextRequest
): CodeSuggestionContext {
  const pathOf = locationPaths(db);
  const containers = containerPlaces(db);
  const types = typeLookup(db);
  const coded = db
    .select({
      code: items.code,
      name: items.name,
      typeId: items.typeId,
      locationId: items.locationId,
      containingItemId: items.containingItemId,
    })
    .from(items)
    .where(isNotNull(items.code))
    .orderBy(desc(items.updatedAt))
    .all()
    .filter((row) => row.code !== null)
    .slice(0, MAX_CONTEXT_CODES);

  const existing = coded.map((row): ContextCode => {
    const container =
      row.containingItemId === null ? undefined : containers.get(row.containingItemId);
    const place = joinPlace(pathOf(container?.locationId ?? row.locationId), container);
    const typeKey = row.typeId === null ? undefined : types.get(row.typeId)?.key;
    return {
      code: row.code ?? '',
      name: row.name,
      ...(typeKey === undefined ? {} : { typeKey }),
      ...(place === undefined ? {} : { place }),
    };
  });

  const type =
    request.typeKey === undefined
      ? undefined
      : [...types.values()].find(
          (entry) => entry.key.toLocaleLowerCase() === request.typeKey?.toLocaleLowerCase()
        );
  const destination = destinationFor(request, pathOf, containers);
  return {
    item: {
      name: request.name.trim(),
      ...(request.typeKey === undefined ? {} : { typeKey: request.typeKey }),
      ...(type === undefined ? {} : { typeLabel: type.label }),
    },
    ...(destination === undefined ? {} : { destination }),
    existing,
    ...(request.stem === undefined ? {} : { stem: request.stem }),
  };
}
