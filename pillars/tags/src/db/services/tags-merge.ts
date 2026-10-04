import { eq } from 'drizzle-orm';

import { tags } from '../schema.js';
import { fail, isDescendant, nowIso, readTag } from './tags-internal.js';

import type { TagsDb } from '../open-tags-db.js';
import type { TagRecord } from './tags-internal.js';

function validateMerge(db: TagsDb, sourceId: string, intoId: string): TagRecord {
  if (sourceId === intoId) fail('merge_invalid', 'A tag cannot be merged into itself');
  const source = readTag(db, sourceId);
  const target = readTag(db, intoId);
  if (source === null) fail('not_found', "Tag '" + sourceId + "' was not found");
  if (target === null) fail('not_found', "Tag '" + intoId + "' was not found");
  if (source.facet !== target.facet) {
    fail('merge_invalid', 'Tags from different facets cannot be merged');
  }
  if (target.archivedAt !== null) {
    fail('merge_invalid', 'A tag cannot be merged into an archived tag');
  }
  if (isDescendant(db, intoId, sourceId)) {
    fail('merge_invalid', 'A tag cannot be merged into one of its descendants');
  }
  return source;
}

function applyMerge(db: TagsDb, sourceId: string, intoId: string): TagRecord {
  const mergedAt = nowIso();
  db.update(tags)
    .set({ archivedAt: mergedAt, mergedIntoId: intoId, updatedAt: mergedAt })
    .where(eq(tags.id, sourceId))
    .run();
  db.update(tags)
    .set({ parentId: intoId, updatedAt: mergedAt })
    .where(eq(tags.parentId, sourceId))
    .run();
  db.update(tags)
    .set({ mergedIntoId: intoId, updatedAt: mergedAt })
    .where(eq(tags.mergedIntoId, sourceId))
    .run();

  const merged = readTag(db, sourceId);
  if (merged === null) fail('not_found', "Tag '" + sourceId + "' was not found");
  return merged;
}

/**
 * Merge one tag identity into another atomically. Source rows remain archived
 * with a pointer to the target; children and prior merged sources are redirected.
 */
export function mergeTag(db: TagsDb, sourceId: string, intoId: string): TagRecord {
  return db.transaction((tx) => {
    validateMerge(tx, sourceId, intoId);
    return applyMerge(tx, sourceId, intoId);
  });
}
