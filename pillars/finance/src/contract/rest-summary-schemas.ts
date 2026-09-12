/**
 * Wire shapes for the spend summary (POPS-3589), split from the route file
 * the way the checkpoints and data-quality domains split theirs, so the
 * generated client and the dashboard panel can take the schema without
 * importing route definitions.
 *
 * Two conventions run through the whole envelope and are the point of it:
 *
 * 1. Every amount arrives as a {@link SpendMeasureSchema} — cents *and* the
 *    number of rows they were measured from. A caller that renders `$0.00`
 *    without looking at `transactionCount` is claiming a measurement nobody
 *    made; a category nothing has ever been filed under and a category that
 *    genuinely netted to nothing are different facts.
 * 2. Every share is nullable, and is `null` exactly when the denominator is
 *    zero. A share of a zero total is undefined, not `0`.
 *
 * There is no income figure, by decision: the ledger holds zero `income` rows
 * (POPS-250), so the field would be a permanent zero that reads as measured.
 */
import { z } from 'zod';

import { SUMMARY_WINDOWS } from './summary-windows.js';

/** Cents together with the row count behind them. See the file header. */
export const SpendMeasureSchema = z.object({
  cents: z.number().int(),
  transactionCount: z.number().int().nonnegative(),
});

const DateRangeSchema = z.object({ start: z.string(), end: z.string() });

export const SummaryWindowSchema = z.object({
  key: z.enum(SUMMARY_WINDOWS),
  /** Inclusive `YYYY-MM-DD`; `null` only for `all`, which has no lower bound. */
  start: z.string().nullable(),
  end: z.string(),
  /**
   * The period compared against — `null` for `all`. A calendar window is
   * compared against the same calendar unit one step back, truncated to the
   * elapsed length and clamped to that unit's last day, so the two ranges can
   * differ in length. Both are stated here rather than implied.
   */
  previous: DateRangeSchema.nullable(),
});

export const AccountSpendSchema = z.object({
  accountId: z.string(),
  /** `null` when the ledger row points at an account that no longer exists. */
  accountName: z.string().nullable(),
  currency: z.string().nullable(),
  archived: z.boolean(),
  spend: SpendMeasureSchema,
  shareOfTotal: z.number().nullable(),
});

export const MonthSpendSchema = z.object({
  month: z.string(),
  spend: SpendMeasureSchema,
  byAccount: z.array(z.object({ accountId: z.string(), spend: SpendMeasureSchema })),
});

export const TagSpendSchema = z.object({
  tag: z.string(),
  spend: SpendMeasureSchema,
  /**
   * Share of the window total. Tag shares do not sum to 1: a transaction
   * carrying three tags contributes its full amount to each.
   */
  shareOfTotal: z.number().nullable(),
});

export const EntitySpendSchema = z.object({
  /** `null` is the unattributed bucket — every row no entity was resolved for. */
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  spend: SpendMeasureSchema,
  shareOfTotal: z.number().nullable(),
});

export const LargestChargeSchema = z.object({
  id: z.string(),
  description: z.string(),
  date: z.string(),
  /** Positive cents — the amount that left the account. */
  cents: z.number().int(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  accountId: z.string(),
  accountName: z.string().nullable(),
});

export const ConcentrationSchema = z.object({
  /** How many entities the share covers — fewer when the window has fewer. */
  entityCount: z.number().int().nonnegative(),
  cents: z.number().int(),
  shareOfTotal: z.number().nullable(),
});

export const RecurringSubscriptionsSchema = z.object({
  /** The tag counted, echoed so a caller can say what the figure is *of*. */
  tag: z.string(),
  spend: SpendMeasureSchema,
  byEntity: z.array(
    z.object({
      entityId: z.string().nullable(),
      entityName: z.string().nullable(),
      spend: SpendMeasureSchema,
    })
  ),
});

export const ForeignSpendSchema = z.object({
  spend: SpendMeasureSchema,
  /** Issuer FX fees over the window — not restricted to spend-typed rows. */
  fees: SpendMeasureSchema,
});

export const SummaryInferenceSchema = z.object({
  largestCharge: LargestChargeSchema.nullable(),
  concentration: ConcentrationSchema,
  recurringSubscriptions: RecurringSubscriptionsSchema,
  foreign: ForeignSpendSchema,
});

export const FinanceSummarySchema = z.object({
  window: SummaryWindowSchema,
  /**
   * The window holds no transactions of any type. Distinct from spend of
   * zero, which a window holding only transfers legitimately produces.
   */
  empty: z.boolean(),
  /**
   * Currencies the contributing accounts are denominated in. More than one
   * means `total` adds unlike units — the ledger converts nothing, so the
   * figure is served with that fact attached.
   */
  currencies: z.array(z.string()),
  total: SpendMeasureSchema,
  /** `null` for `all`, which has no period before it. */
  previousTotal: SpendMeasureSchema.nullable(),
  deltaCents: z.number().int().nullable(),
  /** Fractional change; `null` when the previous period's spend was zero. */
  deltaRatio: z.number().nullable(),
  byAccount: z.array(AccountSpendSchema),
  byMonth: z.array(MonthSpendSchema),
  byTag: z.array(TagSpendSchema),
  byEntity: z.array(EntitySpendSchema),
  inference: SummaryInferenceSchema,
});

export type SpendMeasure = z.infer<typeof SpendMeasureSchema>;
export type FinanceSummaryBody = z.infer<typeof FinanceSummarySchema>;
