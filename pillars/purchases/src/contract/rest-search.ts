/**
 * `search.*` sub-router — the purchases pillar's slice of unified search.
 *
 * The orchestrator federates search by POSTing the same `{ query, context? }`
 * envelope to every pillar whose registered manifest declares a non-empty
 * `search.adapters`, then merging the returned `hits`
 * (`pillars/orchestrator/src/search/federation.ts`). Both purchases adapters —
 * orders and line items — are served by this ONE endpoint, exactly as finance
 * serves its three, because a pillar's `/search` returns a single flat ranked
 * list and the federator decorates at pillar granularity.
 *
 * The wire shapes mirror `pillars/finance/src/contract/rest-search.ts`, which
 * in turn mirrors the cross-package `@pops/types` search contract. They are
 * restated rather than imported because a pillar contract must be readable
 * from its own OpenAPI projection alone — a polyglot consumer generating a
 * client off `openapi/purchases.openapi.json` has no `@pops/types`.
 *
 * `data` is a permissive record on the wire: each adapter carries its own
 * domain payload and the engine treats it as opaque.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/**
 * What a filter may narrow on.
 *
 * These are the scope terms every other read on this pillar already takes —
 * `GET /purchases` and `GET /analytics/merchant-spend` both take sources,
 * statuses and a date window — because search narrows the same set of orders
 * and a second scope language would be a second thing to keep true. A filter
 * on a line item's own columns is not here for the same reason: it would
 * scope one adapter and silently pass the other through unfiltered, which is
 * the failure this vocabulary exists to make impossible.
 *
 * Both adapters honour a filter, and an item is in scope exactly when the
 * order it was bought on is: a line has no source, status or date of its own.
 *
 * Closed rather than a free string. The field a caller may send is published
 * in the OpenAPI projection and therefore in every generated client, so an
 * unsupported one is a 400 from the contract itself rather than a 200 whose
 * results quietly ignored it.
 */
export const SEARCH_FILTER_FIELDS = ['source', 'status', 'orderedAt'] as const;
export type SearchFilterField = (typeof SEARCH_FILTER_FIELDS)[number];

/**
 * How a filter compares. Closed for the same reason the fields are, and
 * narrow because these are the only comparisons the scope expresses:
 * membership for the two vocabularies, an inclusive bound for the date.
 *
 * Which operators a given field takes is not expressible here — `orderedAt`
 * takes no `eq` and `source` takes no `gte` — so an unsupported pairing is
 * refused by the handler with a 400 naming both halves.
 */
export const SEARCH_FILTER_OPERATORS = ['eq', 'gte', 'lte'] as const;
export type SearchFilterOperator = (typeof SEARCH_FILTER_OPERATORS)[number];

/** A structured filter for advanced query syntax. Mirrors `StructuredFilter` in `@pops/types`. */
export const SearchFilterSchema = z.object({
  field: z.enum(SEARCH_FILTER_FIELDS),
  operator: z.enum(SEARCH_FILTER_OPERATORS),
  value: z.string().trim().min(1),
});

/**
 * A user search query. Mirrors `Query` in `@pops/types`.
 *
 * Filters are conjunctive, with one exception that is not one: repeating an
 * equality filter widens it to set membership, exactly as `?sources=a&sources=b`
 * does on the order index. Read strictly, `source eq a AND source eq b` can
 * only ever be empty, and answering a plainly-meant "either of these" with
 * zero hits is a worse trap than the asymmetry. Repeating a bound tightens
 * it, which is what the conjunction already means.
 */
export const SearchQuerySchema = z.object({
  text: z.string(),
  filters: z.array(SearchFilterSchema).optional(),
});

/** Context about where search is invoked from. Mirrors `SearchContext` in `@pops/types`. */
export const SearchContextSchema = z.object({
  app: z.string().nullable(),
  page: z.string().nullable(),
  entity: z
    .object({
      uri: z.string(),
      type: z.string(),
      title: z.string(),
    })
    .optional(),
  filters: z.record(z.string(), z.string()).optional(),
});

/** How a hit was matched against the query. Mirrors `MatchType` in `@pops/types`. */
export const SearchMatchTypeSchema = z.enum(['exact', 'prefix', 'contains']);

export const SearchHitSchema = z.object({
  uri: z.string(),
  score: z.number(),
  matchField: z.string(),
  matchType: SearchMatchTypeSchema,
  data: z.record(z.string(), z.unknown()),
});

const SearchBodySchema = z.object({
  query: SearchQuerySchema,
  context: SearchContextSchema.optional(),
});

export const purchasesSearchContract = c.router({
  search: {
    method: 'POST',
    path: '/search',
    body: SearchBodySchema,
    responses: {
      200: z.object({ hits: z.array(SearchHitSchema) }),
      // A filter this pillar cannot apply. Declared, because the alternative
      // a caller cannot detect is a 200 computed as though it were never sent.
      400: ErrorBodySchema,
    },
    summary: "Search the purchases pillar's orders and line items for the unified search engine",
  },
});
