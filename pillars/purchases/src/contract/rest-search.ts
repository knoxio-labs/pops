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

const c = initContract();

/** A structured filter for advanced query syntax. Mirrors `StructuredFilter` in `@pops/types`. */
export const SearchFilterSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.string(),
});

/** A user search query. Mirrors `Query` in `@pops/types`. */
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
    },
    summary: "Search the purchases pillar's orders and line items for the unified search engine",
  },
});
