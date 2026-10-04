import { initContract } from '@ts-rest/core';

import { tagsVocabularyContract } from './rest-tags.js';

const c = initContract();

/** The ts-rest contract for the tags pillar. */
export const tagsContract = c.router(
  { tags: tagsVocabularyContract },
  { pathPrefix: '', strictStatusCodes: false }
);

/** Type-level view of the tags REST contract. */
export type TagsContract = typeof tagsContract;
