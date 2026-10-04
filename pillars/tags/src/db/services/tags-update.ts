import { eq } from 'drizzle-orm';

import { tags } from '../schema.js';
import {
  assertParentIsValid,
  assertValidWindow,
  fail,
  hasActiveNameConflict,
  isActiveNameUniqueViolation,
  nowIso,
  readTag,
} from './tags-internal.js';

import type { TagsDb } from '../open-tags-db.js';
import type { TagRecord, UpdateTagInput } from './tags-internal.js';

interface TagUpdatePatch {
  name?: string;
  parentId?: string | null;
  description?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  windowRegion?: string | null;
}

function buildTagUpdatePatch(input: UpdateTagInput): TagUpdatePatch {
  const patch: TagUpdatePatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.parentId !== undefined) patch.parentId = input.parentId;
  if (input.window !== undefined) {
    assertValidWindow(input.window);
    patch.windowStart = input.window?.start ?? null;
    patch.windowEnd = input.window?.end ?? null;
    patch.windowRegion = input.window?.region ?? null;
  }
  return patch;
}

function assertUpdateIsValid(
  db: TagsDb,
  id: string,
  current: TagRecord,
  input: UpdateTagInput
): void {
  if (input.parentId != null) assertParentIsValid(db, input.parentId, current.facet, id);
  if (
    input.name !== undefined &&
    current.archivedAt === null &&
    hasActiveNameConflict(db, current.facet, input.name, id)
  ) {
    fail(
      'name_conflict',
      "An active tag named '" + input.name + "' already exists in '" + current.facet + "'"
    );
  }
}

function writeTagUpdate({
  db,
  current,
  patch,
}: {
  db: TagsDb;
  current: TagRecord;
  patch: TagUpdatePatch;
}): TagRecord {
  try {
    const updated = db
      .update(tags)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(tags.id, current.id))
      .returning()
      .get();
    if (updated === undefined) fail('not_found', "Tag '" + current.id + "' was not found");
    return updated;
  } catch (error) {
    if (isActiveNameUniqueViolation(error)) {
      fail(
        'name_conflict',
        "An active tag named '" +
          (patch.name ?? current.name) +
          "' already exists in '" +
          current.facet +
          "'"
      );
    }
    throw error;
  }
}

function updateTagInTransaction(db: TagsDb, id: string, input: UpdateTagInput): TagRecord {
  const current = readTag(db, id);
  if (current === null) fail('not_found', "Tag '" + id + "' was not found");
  const patch = buildTagUpdatePatch(input);
  if (Object.keys(patch).length === 0) return current;
  assertUpdateIsValid(db, id, current, input);
  return writeTagUpdate({ db, current, patch });
}

/** Update mutable vocabulary fields. An empty patch returns the current row. */
export function updateTag(db: TagsDb, id: string, input: UpdateTagInput): TagRecord {
  return db.transaction((tx) => updateTagInTransaction(tx, id, input));
}

/** Archive a tag without deleting its vocabulary row or assignments. */
export function archiveTag(db: TagsDb, id: string): TagRecord {
  return db.transaction((tx) => {
    if (readTag(tx, id) === null) fail('not_found', "Tag '" + id + "' was not found");
    const archivedAt = nowIso();
    const updated = tx
      .update(tags)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(eq(tags.id, id))
      .returning()
      .get();
    if (updated === undefined) fail('not_found', "Tag '" + id + "' was not found");
    return updated;
  });
}

/** Restore an archived tag unless it has been merged into another identity. */
export function unarchiveTag(db: TagsDb, id: string): TagRecord {
  return db.transaction((tx) => {
    const current = readTag(tx, id);
    if (current === null) fail('not_found', "Tag '" + id + "' was not found");
    if (current.archivedAt === null) return current;
    if (current.mergedIntoId !== null) {
      fail('merge_invalid', 'A merged-away tag cannot be unarchived');
    }
    if (hasActiveNameConflict(tx, current.facet, current.name, id)) {
      fail(
        'name_conflict',
        "An active tag named '" + current.name + "' already exists in '" + current.facet + "'"
      );
    }
    try {
      const unarchived = tx
        .update(tags)
        .set({ archivedAt: null, updatedAt: nowIso() })
        .where(eq(tags.id, id))
        .returning()
        .get();
      if (unarchived === undefined) fail('not_found', "Tag '" + id + "' was not found");
      return unarchived;
    } catch (error) {
      if (isActiveNameUniqueViolation(error)) {
        fail(
          'name_conflict',
          "An active tag named '" + current.name + "' already exists in '" + current.facet + "'"
        );
      }
      throw error;
    }
  });
}
