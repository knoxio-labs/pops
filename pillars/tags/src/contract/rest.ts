import { initContract } from '@ts-rest/core';

import { TagListResponseSchema } from './rest-schemas.js';

const c = initContract();

const tagsRoutes = c.router({
  list: {
    method: 'GET',
    path: '/tags',
    responses: { 200: TagListResponseSchema },
    summary: 'List the shared tag vocabulary',
  },
});

/** The ts-rest contract for the tags pillar. */
export const tagsContract = c.router(
  { tags: tagsRoutes },
  { pathPrefix: '', strictStatusCodes: false }
);

/** Type-level view of the tags REST contract. */
export type TagsContract = typeof tagsContract;
