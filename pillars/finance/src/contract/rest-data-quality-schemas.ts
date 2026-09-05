/**
 * Wire shapes for the dashboard's data-quality nudge feed (POPS-2881,
 * ADR-051). Split from `rest-data-quality.ts` the way the checkpoints domain
 * splits its schemas — kept out of the route file so a future consumer of the
 * schema alone (POPS-250's panel, the generated client) never has to import
 * route definitions to get it.
 *
 * `kind` discriminates the union rather than the envelope carrying separate
 * arrays per kind, so the panel truncates one flat, ranked list instead of
 * merging several. Members are added by extending the union, never by
 * changing this envelope.
 */
import { z } from 'zod';

/**
 * An account whose LATEST checkpoint disagrees with what the ledger
 * predicted (`AccountBalance.inconsistent` from POPS-2879). Never one per
 * historical checkpoint — an old flagged checkpoint superseded by a
 * consistent newer one is not a nudge, the account has been re-anchored.
 */
export const CheckpointInconsistencyNudgeSchema = z.object({
  kind: z.literal('checkpoint-inconsistency'),
  accountId: z.string(),
  accountName: z.string(),
  checkpointId: z.string(),
  /** ISO `YYYY-MM-DD` the flagged checkpoint was true as of. */
  asOf: z.string(),
  /** Ledger-signed minor units: `checkpoint.balanceCents - expected`. */
  deltaCents: z.number().int(),
  currency: z.string(),
  /** Where the panel links to for the detail — the account's checkpoints page. */
  href: z.string(),
});

/**
 * An account nobody has fed for longer than its own rhythm (POPS-2890). The
 * threshold is per account — the median gap between its last import batches,
 * or 45 days when it has fewer than three — so a monthly card forty days
 * quiet is stale and a wallet that sees a row a quarter is not. Measured from
 * the newest transaction, not the last import: an import that wrote nothing
 * new does not make the ledger any less behind.
 */
export const StaleAccountNudgeSchema = z.object({
  kind: z.literal('stale-account'),
  accountId: z.string(),
  accountName: z.string(),
  /** ISO `YYYY-MM-DD` of the account's newest transaction. */
  newestTransactionDate: z.string(),
  /** Days from that transaction to today. */
  daysStale: z.number().int().nonnegative(),
  /** The account's own threshold, so the panel can say "usually every N days". */
  thresholdDays: z.number().int().positive(),
  /** Where the panel links to for the detail — the account page. */
  href: z.string(),
});

/** One entry in the nudge feed, discriminated on `kind`. */
export const NudgeSchema = z.discriminatedUnion('kind', [
  CheckpointInconsistencyNudgeSchema,
  StaleAccountNudgeSchema,
]);
