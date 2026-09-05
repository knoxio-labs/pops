/**
 * Wire shapes for the dashboard's data-quality nudge feed (POPS-2881,
 * ADR-051). Split from `rest-data-quality.ts` the way the checkpoints domain
 * splits its schemas — kept out of the route file so a future consumer of the
 * schema alone (POPS-250's panel, the generated client) never has to import
 * route definitions to get it.
 *
 * `kind` discriminates the union rather than the envelope carrying separate
 * arrays per kind, so the panel truncates one flat, ranked list instead of
 * merging several. One member exists today; POPS-250 (staleness excluded,
 * that's POPS-2890) adds more by extending the union, never by changing this
 * envelope.
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

/** One entry in the nudge feed. A discriminated union of one member today. */
export const NudgeSchema = z.discriminatedUnion('kind', [CheckpointInconsistencyNudgeSchema]);
