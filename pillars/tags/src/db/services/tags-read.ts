import { and, asc, eq, gte, isNull } from 'drizzle-orm';

import { tags } from '../schema.js';
import { readTag } from './tags-internal.js';

import type { TagsDb } from '../open-tags-db.js';
import type { ListTagsFilter, TagRecord } from './tags-internal.js';

/** Return a tag by id, or null when the id is unknown. */
export function getTag(db: TagsDb, id: string): TagRecord | null {
  return readTag(db, id);
}

/** List tags in stable creation order, hiding archived rows by default. */
export function listTags(db: TagsDb, filter: ListTagsFilter = {}): TagRecord[] {
  const conditions = [
    filter.facet === undefined ? undefined : eq(tags.facet, filter.facet),
    filter.includeArchived === true ? undefined : isNull(tags.archivedAt),
    filter.updatedSince === undefined ? undefined : gte(tags.updatedAt, filter.updatedSince),
  ].filter(
    (condition): condition is Exclude<typeof condition, undefined> => condition !== undefined
  );

  const query = db.select().from(tags);
  return conditions.length === 0
    ? query.orderBy(asc(tags.createdAt), asc(tags.id)).all()
    : query
        .where(and(...conditions))
        .orderBy(asc(tags.createdAt), asc(tags.id))
        .all();
}
