import { MobilePurchaseTagsResponseSchema } from '../../contract/mobile-purchases-schemas.js';
/**
 * bfm's calls into purchases' `search.*` sub-router and its `tagVocabulary`
 * read — split from `client.ts` purely to keep that file under the
 * line-count cap, on the same reasoning `draft-client.ts` is its own file.
 */
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { PurchasesSearchResponseSchema, toMobileSearchHit } from './search-wire.js';

import type {
  MobilePurchaseSearchResponse,
  MobilePurchaseTagsResponse,
} from '../../contract/mobile-purchases-schemas.js';

export const PURCHASES_PILLAR_ID = 'purchases';

/**
 * The `purchase.*` router's `tagVocabulary` procedure, plus the two reads
 * `client.ts`'s own {@link PurchasesReceiptRouter} already names — restated
 * here rather than imported from it to avoid a cycle, since this file's
 * `search`/`tagVocabulary` are merged INTO `MobilePurchasesClient` there.
 */
export type PurchasesTagVocabularyRouter = {
  purchase: {
    tagVocabulary: (input: Record<string, never>) => Promise<unknown>;
  };
};

/**
 * The `search.*` sub-router's own key: `search: purchasesSearchContract`,
 * whose one route is itself named `search`
 * (`pillars/purchases/src/api/rest/handlers.ts`'s `search: makeSearchHandlers(...)`
 * registration). Its own type rather than folded into
 * {@link PurchasesTagVocabularyRouter}: it is a disjoint sub-router on the
 * same producer, exactly the reason `client.ts`'s
 * `PurchasesReceiptBytesRouter` is separate from its `PurchasesReceiptRouter`.
 */
export type PurchasesSearchRouter = {
  search: {
    search: (input: {
      body: {
        query: {
          text: string;
          filters?: readonly { field: string; operator: string; value: string }[];
        };
      };
    }) => Promise<unknown>;
  };
};

export interface SearchPurchasesRequest {
  readonly q: string;
  /** A single raw purchases-pillar status, forwarded as its `status eq` filter. */
  readonly status?: string;
  /** Chosen item tags, forwarded as purchases' own `tags eq` filter, any-of. */
  readonly tags?: readonly string[];
}

/**
 * The pillar's own structured filters a search request denotes, or
 * `undefined` when it names none — sending no filter at all, rather than an
 * empty array, for a request that asked to narrow by nothing.
 */
function searchFilters(
  request: SearchPurchasesRequest
): readonly { field: string; operator: string; value: string }[] | undefined {
  const filters: { field: string; operator: string; value: string }[] = [];
  if (request.status !== undefined) {
    filters.push({ field: 'status', operator: 'eq', value: request.status });
  }
  for (const tag of request.tags ?? []) {
    filters.push({ field: 'tags', operator: 'eq', value: tag });
  }
  return filters.length > 0 ? filters : undefined;
}

export async function search(
  gateway: PillarGateway,
  request: SearchPurchasesRequest
): Promise<GatewayOutcome<MobilePurchaseSearchResponse>> {
  const outcome = await gateway.call<PurchasesSearchRouter, unknown>(
    PURCHASES_PILLAR_ID,
    (handle) =>
      handle.search.search({
        body: { query: { text: request.q, filters: searchFilters(request) } },
      })
  );

  const parsed = parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    PurchasesSearchResponseSchema,
    'search.search'
  );
  if (!isGatewayOk(parsed)) return parsed;

  try {
    return { kind: 'ok', value: { hits: parsed.value.hits.map(toMobileSearchHit) } };
  } catch (error) {
    console.warn(
      `[bfm-api] ${PURCHASES_PILLAR_ID}.search.search returned a hit this pillar cannot read: ${String(error)}`
    );
    return { kind: 'contract-mismatch', pillar: PURCHASES_PILLAR_ID, status: 502 };
  }
}

export async function tagVocabulary(
  gateway: PillarGateway
): Promise<GatewayOutcome<MobilePurchaseTagsResponse>> {
  const outcome = await gateway.call<PurchasesTagVocabularyRouter, unknown>(
    PURCHASES_PILLAR_ID,
    (handle) => handle.purchase.tagVocabulary({})
  );

  return parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    MobilePurchaseTagsResponseSchema,
    'purchase.tagVocabulary'
  );
}
