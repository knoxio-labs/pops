import { initServer } from '@ts-rest/express';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { TagSchema } from '../../contract/rest-tags-schemas.js';
import { tagsContract } from '../../contract/rest.js';
import { TagsServiceError } from '../../db/errors.js';
import { tags } from '../../db/schema/tags.js';
import {
  archiveTag,
  createOrGetTag,
  expandTagIds,
  getTag,
  listTags,
  mergeTag,
  unarchiveTag,
  updateTag,
} from '../../db/services/tags.js';
import { tagsErrors } from '../errors.js';

import type { TagsDb } from '../../db/index.js';
import type { CreateTagInput, ListTagsFilter, TagRecord } from '../../db/services/tags.js';
import type { TagsApiDeps } from '../handlers.js';

const server: ReturnType<typeof initServer> = initServer();

/** Translate domain error codes into the stable tags API error catalogue. */
async function withTagsErrors<T>(operation: () => T): Promise<T> {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TagsServiceError) tagsErrors[error.code]();
    throw error;
  }
}

function toTag(record: TagRecord) {
  const window =
    record.windowStart === null && record.windowEnd === null && record.windowRegion === null
      ? null
      : {
          start: record.windowStart,
          end: record.windowEnd,
          region: record.windowRegion,
        };

  return TagSchema.parse({
    id: record.id,
    facet: record.facet,
    name: record.name,
    parentId: record.parentId,
    description: record.description,
    window,
    archived: record.archivedAt !== null,
    archivedAt: record.archivedAt,
    mergedIntoId: record.mergedIntoId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function createTag(
  db: TagsDb,
  input: CreateTagInput
): { readonly created: boolean; readonly tag: TagRecord } {
  return db.transaction(
    (tx) => {
      const matchingActiveTag = tx
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            eq(tags.facet, input.facet),
            sql`lower(${tags.name}) = lower(${input.name})`,
            isNull(tags.archivedAt)
          )
        )
        .get();
      const tag = createOrGetTag(tx, input);
      return { created: matchingActiveTag === undefined, tag };
    },
    { behavior: 'immediate' }
  );
}

/** Build handlers for the shared tag vocabulary REST contract. */
export function makeTagsRestHandlers(
  deps: TagsApiDeps
): ReturnType<typeof server.router<typeof tagsContract>> {
  return server.router(tagsContract, {
    tags: {
      list: ({ query }) =>
        withTagsErrors(() => {
          const filter: ListTagsFilter = {
            includeArchived: query.includeArchived === 'true',
            ...(query.facet === undefined ? {} : { facet: query.facet }),
            ...(query.updatedSince === undefined ? {} : { updatedSince: query.updatedSince }),
          };
          return {
            status: 200 as const,
            body: { tags: listTags(deps.tagsDb.db, filter).map(toTag) },
          };
        }),
      get: ({ params }) =>
        withTagsErrors(() => {
          const tag = getTag(deps.tagsDb.db, params.id);
          if (tag === null) return tagsErrors.not_found();
          return { status: 200 as const, body: toTag(tag) };
        }),
      create: ({ body }) =>
        withTagsErrors(() => {
          const result = createTag(deps.tagsDb.db, body);
          return {
            status: result.created ? (201 as const) : (200 as const),
            body: toTag(result.tag),
          };
        }),
      update: ({ params, body }) =>
        withTagsErrors(() => ({
          status: 200 as const,
          body: toTag(updateTag(deps.tagsDb.db, params.id, body)),
        })),
      archive: ({ params }) =>
        withTagsErrors(() => ({
          status: 200 as const,
          body: toTag(archiveTag(deps.tagsDb.db, params.id)),
        })),
      unarchive: ({ params }) =>
        withTagsErrors(() => ({
          status: 200 as const,
          body: toTag(unarchiveTag(deps.tagsDb.db, params.id)),
        })),
      merge: ({ params, body }) =>
        withTagsErrors(() => ({
          status: 200 as const,
          body: toTag(mergeTag(deps.tagsDb.db, params.id, body.intoId)),
        })),
      expand: ({ body }) =>
        withTagsErrors(() => ({
          status: 200 as const,
          body: expandTagIds(deps.tagsDb.db, body.ids),
        })),
    },
  });
}
