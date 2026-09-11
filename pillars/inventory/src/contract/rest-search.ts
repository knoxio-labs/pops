/**
 * `search.*` sub-router — the inventory pillar's slice of unified search.
 *
 * Ported from the monolith's static `search-adapters.ts` binding of
 * `inventoryItemsSearchAdapter` (`inventory/items/search-adapter.ts`).
 *
 * The orchestrator federates search by POSTing the same `{ query, context? }`
 * envelope to every installed pillar's `/search` endpoint and merging the
 * returned `hits`. This contract describes inventory's slice — the home
 * inventory items adapter.
 *
 * The `Query` / `SearchContext` / `SearchHit` zod shapes mirror the
 * cross-package `@pops/types` search contract (`packages/types/src/search.ts`)
 * so the wire shape is byte-identical to the in-process adapter contract it
 * replaces. `data` is a permissive record because the adapter carries its own
 * domain-specific hit payload — the engine treats it as opaque.
 *
 * The filter is the one shape that is deliberately NARROWER than the shared
 * one rather than a restatement of it: `@pops/types` types `field` and
 * `operator` as free strings, and this pillar closes both, because a filter
 * it cannot apply must be refusable rather than silently dropped — the same
 * defect purchases and finance fixed in their own filter vocabularies.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/**
 * What a filter may narrow on.
 *
 * These are the same scope terms `GET /items` already takes
 * (`room`/`type`/`condition`/`inUse`/`deductible`/`locationId`/`assetId`),
 * because search narrows the same set of items and a second scope language
 * would be a second thing to keep true.
 *
 * Closed rather than a free string. The field a caller may send is published
 * in the OpenAPI projection and therefore in every generated client, so an
 * unsupported one is a 400 from the contract itself rather than a 200 whose
 * results quietly ignored it.
 */
export const SEARCH_FILTER_FIELDS = [
  'room',
  'type',
  'condition',
  'inUse',
  'deductible',
  'locationId',
  'assetId',
] as const;
export type SearchFilterField = (typeof SEARCH_FILTER_FIELDS)[number];

/**
 * How a filter compares. Every field above is a single discrete value on the
 * row, not a range, so equality is the only comparison any of them express.
 */
export const SEARCH_FILTER_OPERATORS = ['eq'] as const;
export type SearchFilterOperator = (typeof SEARCH_FILTER_OPERATORS)[number];

/**
 * A structured filter for advanced query syntax.
 *
 * `StructuredFilter` in `@pops/types` narrowed to what this pillar can apply,
 * not a restatement of it: a caller sending an arbitrary well-formed
 * `StructuredFilter` is rejected here rather than accepted and ignored.
 */
export const StructuredFilterSchema = z.object({
  field: z.enum(SEARCH_FILTER_FIELDS),
  operator: z.enum(SEARCH_FILTER_OPERATORS),
  value: z.string().trim().min(1),
});

/** A user search query. Mirrors `Query` in `@pops/types`. */
export const QuerySchema = z.object({
  text: z.string(),
  filters: z.array(StructuredFilterSchema).optional(),
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

/** How a search hit was matched against the query. Mirrors `MatchType` in `@pops/types`. */
export const MatchTypeSchema = z.enum(['exact', 'prefix', 'contains']);

/**
 * A single ranked search result. Mirrors `SearchHit` in `@pops/types`. `data`
 * is the domain-specific payload, opaque to the engine/orchestrator, so it is
 * typed as a permissive record on the wire.
 */
export const SearchHitSchema = z.object({
  uri: z.string(),
  score: z.number(),
  matchField: z.string(),
  matchType: MatchTypeSchema,
  data: z.record(z.string(), z.unknown()),
});

const SearchBody = z.object({
  query: QuerySchema,
  context: SearchContextSchema.optional(),
});

export const inventorySearchContract = c.router({
  search: {
    method: 'POST',
    path: '/search',
    body: SearchBody,
    responses: {
      200: z.object({ hits: z.array(SearchHitSchema) }),
      // A filter this pillar cannot apply. Declared, because the alternative
      // a caller cannot detect is a 200 computed as though it were never sent.
      400: ErrorBodySchema,
    },
    summary: "Search the inventory pillar's items for the unified search engine",
  },
});
