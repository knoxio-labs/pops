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
 * narrow on it; nothing in this pillar's ranking answers differently for a
 * caller sitting on an order than for one searching from anywhere else, so
 * honouring it in name only would be a claim the pillar cannot back.
 */
import {
  searchFilterScope,
  searchPurchases,
  searchPurchasesPage,
  type SearchMatchType,
} from '../../db/index.js';
import { purchaseErrorBody } from '../errors.js';

import type { z } from 'zod';

import type { SearchQuerySchema } from '../../contract/rest-search.js';
import type { PurchasesDb } from '../../db/index.js';

type SearchBody = { query: z.infer<typeof SearchQuerySchema> };

function toSearchHit(hit: {
  uri: string;
  score: number;
  matchField: string;
  matchType: SearchMatchType;
  data: Record<string, unknown>;
}) {
  return {
    uri: hit.uri,
    score: hit.score,
    matchField: hit.matchField,
    matchType: hit.matchType,
    data: { ...hit.data },
  };
}

export function makeSearchHandlers(db: PurchasesDb) {
  return {
    search: async ({ body }: { body: SearchBody }) => {
      const { text, filters, cursor, kind, limit } = body.query;
      const scope = searchFilterScope(filters ?? []);
      if (!scope.ok) {
        return {
          status: 400 as const,
          body: purchaseErrorBody('unsupported_filter', { message: scope.message }),
        };
      }

      if (cursor !== undefined || limit !== undefined || kind !== undefined) {
        const page = searchPurchasesPage(db, text, scope.scope, {
          ...(kind === undefined ? {} : { kind }),
          ...(cursor === undefined ? {} : { cursor }),
          limit: limit ?? 25,
        });
        if (page === null) {
          return {
            status: 400 as const,
            body: purchaseErrorBody('invalid_cursor'),
          };
        }

        return {
          status: 200 as const,
          body: {
            hits: page.hits.map(toSearchHit),
            nextCursor: page.nextCursor,
            totalCount: page.totalCount,
          },
        };
      }

      return {
        status: 200 as const,
        body: { hits: searchPurchases(db, text, scope.scope).map(toSearchHit) },
      };
    },
  };
}
