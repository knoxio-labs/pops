import { tags } from '../schema.js';
import {
  assertKnownFacet,
  assertParentIsValid,
  assertValidWindow,
  fail,
  findActiveByFacetAndName,
  isActiveNameUniqueViolation,
} from './tags-internal.js';

import type { TagsDb } from '../open-tags-db.js';
import type { CreateTagInput, TagRecord } from './tags-internal.js';

/**
 * Return the active tag with the same facet and case-insensitive name, or
 * insert it. The partial unique index is the final arbiter if two writers race.
 * Existing metadata is left untouched when a matching active tag is found.
 */
export function createOrGetTag(db: TagsDb, input: CreateTagInput): TagRecord {
  assertKnownFacet(input.facet);
  const existing = findActiveByFacetAndName(db, input.facet, input.name);
  if (existing !== null) return existing;

  return insertOrGetTag(db, input);
}

function insertOrGetTag(db: TagsDb, input: CreateTagInput): TagRecord {
  assertValidWindow(input.window);
  const parentId = input.parentId ?? null;
  if (parentId !== null) assertParentIsValid(db, parentId, input.facet);

  try {
    return insertTag(db, input, parentId);
  } catch (error) {
    const raced = findActiveByFacetAndName(db, input.facet, input.name);
    if (raced !== null) return raced;
    if (isActiveNameUniqueViolation(error)) {
      fail(
        'name_conflict',
        "An active tag named '" + input.name + "' already exists in '" + input.facet + "'"
      );
    }
    throw error;
  }
}

function insertTag(db: TagsDb, input: CreateTagInput, parentId: string | null): TagRecord {
  const created = db
    .insert(tags)
    .values({
      facet: input.facet,
      name: input.name,
      parentId,
      description: input.description ?? null,
      windowStart: input.window?.start ?? null,
      windowEnd: input.window?.end ?? null,
      windowRegion: input.window?.region ?? null,
    })
    .returning()
    .get();
  if (created === undefined) throw new Error('Tag insert did not return a row');
  return created;
}
