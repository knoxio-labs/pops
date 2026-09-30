import { listTagVocabulary, listTagVocabularyPage, type PurchasesDb } from '../../db/index.js';
import { purchaseErrorBody } from '../errors.js';

import type { TagVocabularyQuery } from '../../contract/rest-purchases.js';

/** Build the tag-vocabulary route with the purchases database it reads. */
export function makePurchaseTagVocabularyHandlers(db: PurchasesDb) {
  return {
    tagVocabulary: async ({ query }: { query: TagVocabularyQuery }) => {
      if (query.search !== undefined || query.cursor !== undefined || query.limit !== undefined) {
        const page = listTagVocabularyPage(db, {
          ...(query.search === undefined || query.search === '' ? {} : { search: query.search }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: query.limit ?? 25,
        });
        if (page === null) {
          return {
            status: 400 as const,
            body: purchaseErrorBody('invalid_cursor'),
          };
        }
        return { status: 200 as const, body: { ...page, tags: [...page.tags] } };
      }

      return { status: 200 as const, body: { tags: [...listTagVocabulary(db)] } };
    },
  };
}
