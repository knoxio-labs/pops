/**
 * Handlers for the `search.*` ts-rest sub-router — purchases' slice of
 * unified search.
 *
 * Thin: the ranking lives in `db/services/search.ts` so the MCP tool and the
 * federated search box get the same answer for the same text. This only
 * widens the service layer's `readonly` hits into the mutable ones ts-rest's
 * response type expects.
 *
 * `context` arrives in the envelope and is deliberately unread. Other pillars
 * narrow on it; purchases' app mounts one index route and no entity page, so
 * there is no `context.page` or `context.entity` worth narrowing by yet, and
 * honouring it in name only would be a claim the pillar cannot back.
 */
import { searchPurchases } from '../../db/index.js';

import type { z } from 'zod';

import type { SearchQuerySchema } from '../../contract/rest-search.js';
import type { PurchasesDb } from '../../db/index.js';

type SearchBody = { query: z.infer<typeof SearchQuerySchema> };

export function makeSearchHandlers(db: PurchasesDb) {
  return {
    search: async ({ body }: { body: SearchBody }) => ({
      status: 200 as const,
      body: {
        hits: searchPurchases(db, body.query.text).map((hit) => ({
          uri: hit.uri,
          score: hit.score,
          matchField: hit.matchField,
          matchType: hit.matchType,
          data: { ...hit.data },
        })),
      },
    }),
  };
}
