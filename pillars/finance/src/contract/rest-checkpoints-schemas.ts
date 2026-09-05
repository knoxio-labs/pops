/**
 * Wire shapes for account checkpoints and balances (POPS-2880, ADR-051).
 *
 * Split from `rest-checkpoints.ts` the way the corrections domain splits its
 * schemas: these are read by the accounts sub-router too, and a route file
 * importing another route file to borrow a schema is how a cycle starts.
 *
 * Every money field here is minor units, ledger-signed — positive is money
 * held, negative is money owed, for assets and liabilities alike. Unlike the
 * loan routes, which speak decimal dollars, nothing converts at this edge: a
 * balance is compared against a bank's figure to the cent, and a float round
 * trip is exactly the kind of drift this epic exists to detect.
 */
import { z } from 'zod';

import { CHECKPOINT_SOURCES } from './checkpoint.js';

/** ISO calendar date, `YYYY-MM-DD`. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO YYYY-MM-DD date');

/** The checkpoint a balance was anchored on. Null when there is none. */
export const BalanceAnchorSchema = z.object({
  checkpointId: z.string(),
  asOf: z.string(),
  source: z.enum(CHECKPOINT_SOURCES),
});

/**
 * An account's balance at a date. `basis: 'transactions'` means no checkpoint
 * exists and the number is the sum of whatever was imported — net flow, not a
 * balance — which is why the field is on the wire rather than inferred from a
 * null anchor by every consumer separately.
 */
export const AccountBalanceSchema = z.object({
  balanceCents: z.number().int(),
  asOf: z.string(),
  basis: z.enum(['checkpoint', 'transactions']),
  anchor: BalanceAnchorSchema.nullable(),
  inconsistent: z.boolean(),
});

/**
 * A stored checkpoint plus what the ledger predicted for it.
 * `expectedBalanceCents`/`deltaCents` are computed per response, never
 * stored — adding the missing transaction has to clear the disagreement with
 * no write to the checkpoint. Both are null for the earliest checkpoint,
 * which anchors the account and has nothing to be measured against.
 */
export const CheckpointSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  balanceCents: z.number().int(),
  asOf: z.string(),
  source: z.enum(CHECKPOINT_SOURCES),
  sourceRef: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  expectedBalanceCents: z.number().int().nullable(),
  deltaCents: z.number().int().nullable(),
});

/** One point on a balance trend: the last day of `month`, end of day. */
export const BalanceHistoryPointSchema = z.object({
  month: z.string(),
  balanceCents: z.number().int(),
});

/**
 * Body for `POST /accounts/:id/checkpoints`.
 *
 * There is no `source` field: this route is `manual` by definition. An
 * importer or a statement parser mints its own checkpoint through the service
 * with the source set from what it actually read (POPS-2882, POPS-2752), and
 * letting a client claim `import` would make the delete gate meaningless.
 */
export const CreateCheckpointInputSchema = z.object({
  balanceCents: z.number().int(),
  asOf: IsoDate,
  note: z.string().max(500).optional(),
});

/** `?asOf=` on the balance route: the date the balance is wanted for. */
export const BalanceQuerySchema = z.object({ asOf: IsoDate.optional() });

/** `?months=` on the history route. Bounded so one request cannot walk a decade. */
export const BalanceHistoryQuerySchema = z.object({
  months: z.coerce.number().int().positive().max(120).optional(),
});
