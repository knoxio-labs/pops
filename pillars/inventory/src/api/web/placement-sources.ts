import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { catalogueRevisions, items, itemTypes } from '../../db/index.js';
import { readPlacement, readPreviousPlacement } from '../../domain/commands/item-fields.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';

import type {
  WebPlacementSourceSchema,
  WebPlacementSourcesResponseSchema,
} from '../../contract/rest-web.js';
import type { CommandDb } from '../../domain/commands/index.js';

const placementCursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-placement-sources'),
  after: z.string().min(1),
});

function cursorAfter(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  try {
    return decodeCursor(placementCursorSchema, cursor).after;
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor });
  }
}

function placementTypeKeys(db: CommandDb, typeIds: readonly string[]): Map<string, string> {
  if (typeIds.length === 0) return new Map();
  const rows = db
    .select({ id: itemTypes.id, key: itemTypes.key })
    .from(itemTypes)
    .innerJoin(catalogueRevisions, eq(catalogueRevisions.revision, itemTypes.revision))
    .where(
      and(
        eq(itemTypes.revision, 1),
        eq(catalogueRevisions.status, 'published'),
        inArray(itemTypes.id, [...typeIds])
      )
    )
    .all();
  return new Map(rows.map((type) => [type.id, type.key]));
}

/**
 * Read active containers without field values, computed values, photos, documents or counts.
 * Type-key fallbacks mirror the web item's published revision-1 compatibility projection.
 */
export function readWebPlacementSources(
  db: CommandDb,
  request: { readonly cursor?: string; readonly limit: number }
): z.infer<typeof WebPlacementSourcesResponseSchema> {
  const after = cursorAfter(request.cursor);
  const rows = db
    .select()
    .from(items)
    .where(
      and(
        isNull(items.deletedAt),
        eq(items.lifecycle, 'active'),
        eq(items.isContainer, 1),
        after === undefined ? undefined : gt(items.id, after)
      )
    )
    .orderBy(asc(items.id))
    .limit(request.limit + 1)
    .all();
  const page = rows.slice(0, request.limit);
  const typeIds = [...new Set(page.flatMap((row) => (row.typeId === null ? [] : [row.typeId])))];
  const typeKeys = placementTypeKeys(db, typeIds);
  const projected: z.infer<typeof WebPlacementSourceSchema>[] = page.map((row) => ({
    id: row.id,
    name: row.name,
    typeId: row.typeId,
    typeKey: row.typeId === null ? null : (typeKeys.get(row.typeId) ?? null),
    legacyType: row.legacyType,
    note: row.note,
    code: row.code,
    quantity: row.quantity,
    lifecycle: row.lifecycle,
    placement: readPlacement(row),
    previousPlacement: readPreviousPlacement(row),
    isContainer: row.isContainer === 1,
    access: row.access,
    isFull: row.isFull === null ? null : row.isFull === 1,
    updatedAt: row.updatedAt,
  }));
  const last = page.at(-1);
  return {
    items: projected,
    nextCursor:
      rows.length > request.limit && last !== undefined
        ? encodeCursor({ v: 1, t: 'web-placement-sources', after: last.id })
        : null,
  };
}
