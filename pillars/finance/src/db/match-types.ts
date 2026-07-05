/**
 * The entity-match provenance discriminator set (CF057/#3658).
 *
 * Records how a transaction's entity assignment was produced at commit time:
 * one of the entity-matcher's deterministic stages
 * (`alias`/`exact`/`prefix`/`contains`), `ai`, `learned` (a correction rule),
 * `manual` (user override), or `none` (no entity — e.g. a transfer).
 *
 * Single source of truth for the union: the `transactions` schema column, the
 * import-service insert input, and the finance wire contracts all reference
 * this tuple so an invalid provenance value cannot compile or serialize.
 */
export const TRANSACTION_MATCH_TYPES = [
  'alias',
  'exact',
  'prefix',
  'contains',
  'ai',
  'learned',
  'manual',
  'none',
] as const;

export type TransactionMatchType = (typeof TRANSACTION_MATCH_TYPES)[number];
