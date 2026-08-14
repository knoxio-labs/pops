/**
 * `search.*` sub-router — the finance pillar's slice of unified search.
 *
 * Ported from the monolith's static `search-adapters.ts` binding, which bound
 * THREE finance adapters to the engine:
 *   - `transactionsSearchAdapter` (`finance/transactions/search-adapter.ts`)
 *   - `budgetsSearchAdapter`       (`finance/budgets/search-adapter.ts`)
 *   - `wishlistSearchAdapter`      (`finance/wishlist/search-adapter.ts`)
 *
 * The orchestrator federates search by POSTing the same `{ query, context? }`
 * envelope to every installed pillar's `/search` endpoint and merging the
 * returned `hits`. Finance aggregates its three adapters under this ONE
 * endpoint (their hits are concatenated into a single ranked list).
 *
 * The `Query` / `SearchContext` / `SearchHit` zod shapes mirror the
 * cross-package `@pops/types` search contract (`packages/types/src/search.ts`)
 * so the wire shape is byte-identical to the in-process adapter contract it
 * replaces. `data` is a permissive record because each adapter carries its own
 * domain-specific hit payload — the engine treats it as opaque.
 *
 * The filter is the one shape that is deliberately NARROWER than the shared
 * one rather than a restatement of it: `@pops/types` types `field` and
 * `operator` as free strings, and this pillar closes both, because a filter
 * it cannot apply must be refusable rather than silently dropped (POPS-2022 —
 * the same defect POPS-1966 fixed in purchases, whose filter vocabulary this
 * one mirrors in shape, not in field names: purchases' three adapters are two
 * views of ONE entity sharing one scope, finance's three adapters are three
 * UNRELATED domains, so each field below narrows exactly one of them rather
 * than a single scope shared by all three).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/**
 * What a filter may narrow on. Each field belongs to exactly one of the three
 * adapters — `type`/`entityId`/`date` to transactions, `period`/`active` to
 * budgets, `priority` to wishlist — because the three domains share no
 * columns to narrow jointly. A field that names a domain a filter cannot
 * reach (e.g. `active` while searching transactions) simply does not
 * constrain that domain's hits, the same way `GET /budgets` takes no `type`
 * param: the field was never a claim about that adapter.
 *
 * Closed rather than a free string. The field a caller may send is published
 * in the OpenAPI projection and therefore in every generated client, so an
 * unsupported one is a 400 from the contract itself rather than a 200 whose
 * results quietly ignored it.
 */
export const SEARCH_FILTER_FIELDS = [
  'type',
  'entityId',
  'date',
  'period',
  'active',
  'priority',
] as const;
export type SearchFilterField = (typeof SEARCH_FILTER_FIELDS)[number];

/**
 * How a filter compares. Closed for the same reason the fields are, and
 * narrow because these are the only comparisons any field below expresses:
 * equality for the enums/ids, an inclusive bound for the transaction date.
 *
 * Which operators a given field takes is not expressible here — `type` takes
 * no `gte` and `date` takes no `eq` — so an unsupported pairing is refused by
 * the handler with a 400 naming both halves.
 */
export const SEARCH_FILTER_OPERATORS = ['eq', 'gte', 'lte'] as const;
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

export const financeSearchContract = c.router({
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
    summary:
      "Search the finance pillar's domains (transactions, budgets, wishlist) for the unified search engine",
  },
});
