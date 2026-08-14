/**
 * Handlers for the `search.*` ts-rest sub-router — purchases' slice of
 * unified search.
 *
 * Thin: the ranking lives in `db/services/search.ts` so the MCP tool and the
 * federated search box get the same answer for the same text. This only
 * widens the service layer's `readonly` hits into the mutable ones ts-rest's
 * response type expects.
 *
 * `query.filters` is read here rather than passed through, because the one
 * thing it must never do is arrive and be ignored: a caller that filtered by
 * source and got every source back has no way to tell that from a filter
 * that matched broadly. The contract closes which fields and operators may
 * be sent; what is left — a pairing the scope cannot express, a value that
 * is not one — is refused with a 400 that names it.
 *
 * `context` arrives in the envelope and is deliberately unread. Other pillars
 * narrow on it; purchases' app mounts one index route and no entity page, so
 * there is no `context.page` or `context.entity` worth narrowing by yet, and
 * honouring it in name only would be a claim the pillar cannot back.
 */
import { searchFilterScope, searchPurchases } from '../../db/index.js';

import type { z } from 'zod';

import type { SearchQuerySchema } from '../../contract/rest-search.js';
import type { PurchasesDb } from '../../db/index.js';

type SearchBody = { query: z.infer<typeof SearchQuerySchema> };

export function makeSearchHandlers(db: PurchasesDb) {
  return {
    search: async ({ body }: { body: SearchBody }) => {
      const scope = searchFilterScope(body.query.filters ?? []);
      if (!scope.ok) {
        return {
          status: 400 as const,
          body: { message: scope.message, code: 'UNSUPPORTED_FILTER' },
        };
      }

      return {
        status: 200 as const,
        body: {
          hits: searchPurchases(db, body.query.text, scope.scope).map((hit) => ({
            uri: hit.uri,
            score: hit.score,
            matchField: hit.matchField,
            matchType: hit.matchType,
            data: { ...hit.data },
          })),
        },
      };
    },
  };
}
