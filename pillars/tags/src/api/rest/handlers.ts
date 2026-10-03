import { initServer } from '@ts-rest/express';
import { asc } from 'drizzle-orm';

import { tagsContract } from '../../contract/rest.js';
import { tags } from '../../db/schema/tags.js';

import type { OpenedTagsDb } from '../../db/index.js';

const server: ReturnType<typeof initServer> = initServer();

/** Build typed handlers for the tags list route. */
export function makeTagsRestHandlers(deps: {
  readonly tagsDb: OpenedTagsDb;
}): ReturnType<typeof server.router<typeof tagsContract>> {
  return server.router(tagsContract, {
    tags: {
      list: async () => ({
        status: 200 as const,
        body: {
          tags: await deps.tagsDb.db
            .select()
            .from(tags)
            .orderBy(asc(tags.facet), asc(tags.name), asc(tags.id)),
        },
      }),
    },
  });
}
