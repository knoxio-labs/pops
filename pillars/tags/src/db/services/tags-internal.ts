import { and, eq, isNull, ne, sql } from 'drizzle-orm';

import { SHARED_TAG_FACETS } from '../../contract/facets.js';
import { TagsServiceError, type TagsServiceErrorCode } from '../errors.js';
import { tags } from '../schema.js';

import type { TagsDb } from '../open-tags-db.js';

export type TagRecord = typeof tags.$inferSelect;

export interface TagWindow {
  start: string | null;
  end: string | null;
  region: string | null;
}

export interface CreateTagInput {
  facet: string;
  name: string;
  parentId?: string | null;
  description?: string | null;
  window?: TagWindow | null;
}

export interface UpdateTagInput {
  name?: string;
  parentId?: string | null;
  description?: string | null;
  window?: TagWindow | null;
}

export interface ListTagsFilter {
  facet?: string;
  includeArchived?: boolean;
  updatedSince?: string;
}

export interface ExpandedTagIds {
  ids: string[];
  unknownIds: string[];
}

export function fail(code: TagsServiceErrorCode, message: string): never {
  throw new TagsServiceError(code, message);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function assertKnownFacet(facet: string): void {
  if (!(SHARED_TAG_FACETS as readonly string[]).includes(facet)) {
    fail('unknown_facet', "Unknown shared tag facet '" + facet + "'");
  }
}

export function assertValidWindow(window: TagWindow | null | undefined): void {
  if (window == null) return;
  if (window.start !== null && window.end !== null && window.end < window.start) {
    fail('window_invalid', 'Tag window end must not precede its start');
  }
  if (window.region !== null && window.start === null) {
    fail('window_invalid', 'A tag window region requires a start date');
  }
}

export function readTag(db: TagsDb, id: string): TagRecord | null {
  return db.select().from(tags).where(eq(tags.id, id)).get() ?? null;
}

export function findActiveByFacetAndName(
  db: TagsDb,
  facet: string,
  name: string
): TagRecord | null {
  return (
    db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.facet, facet),
          sql`lower(${tags.name}) = lower(${name})`,
          isNull(tags.archivedAt)
        )
      )
      .get() ?? null
  );
}

export function hasActiveNameConflict(
  db: TagsDb,
  facet: string,
  name: string,
  exceptId?: string
): boolean {
  const conditions = [
    eq(tags.facet, facet),
    sql`lower(${tags.name}) = lower(${name})`,
    isNull(tags.archivedAt),
  ];
  const where =
    exceptId === undefined ? and(...conditions) : and(...conditions, ne(tags.id, exceptId));
  return db.select({ id: tags.id }).from(tags).where(where).get() !== undefined;
}

export function isActiveNameUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('uq_tags_active_facet_name');
}

export function assertParentIsValid(
  db: TagsDb,
  parentId: string,
  facet: string,
  childId?: string
): void {
  const parent = readTag(db, parentId);
  if (parent === null || parent.facet !== facet || parent.archivedAt !== null) {
    fail('parent_invalid', 'Tag parent must exist, share the facet, and be active');
  }

  const visited = new Set<string>();
  let ancestorId: string | null = parentId;
  while (ancestorId !== null) {
    if (ancestorId === childId || visited.has(ancestorId)) {
      fail('parent_invalid', 'Tag parent would create a cycle');
    }
    visited.add(ancestorId);
    ancestorId = readTag(db, ancestorId)?.parentId ?? null;
  }
}

export function isDescendant(
  db: TagsDb,
  possibleDescendantId: string,
  ancestorId: string
): boolean {
  const visited = new Set<string>();
  let currentId: string | null = possibleDescendantId;
  while (currentId !== null && !visited.has(currentId)) {
    if (currentId === ancestorId) return true;
    visited.add(currentId);
    currentId = readTag(db, currentId)?.parentId ?? null;
  }
  return false;
}
