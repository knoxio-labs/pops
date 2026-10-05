import { z } from 'zod';

/** Query supported by the mobile finance summary route. */
export const MobileFinanceSummaryQuerySchema = z.object({
  window: z.enum(['30d', '90d', 'month', 'year', 'all']).optional(),
  topLimit: z.coerce.number().int().positive().max(50).optional(),
});

/** Inputs the mobile finance summary route accepts. */
export type MobileFinanceSummaryQuery = z.infer<typeof MobileFinanceSummaryQuerySchema>;

const SpendMeasureSchema = z.object({
  cents: z.number().int(),
  transactionCount: z.number().int().nonnegative(),
});

const FinanceSummaryWindowSchema = z.object({
  key: z.enum(['30d', '90d', 'month', 'year', 'all']),
  start: z.string().nullable(),
  end: z.string(),
  previous: z.object({ start: z.string(), end: z.string() }).nullable(),
});

const CostOfCreditSummarySchema = z.object({
  total: SpendMeasureSchema,
  previousTotal: SpendMeasureSchema.nullable(),
  deltaCents: z.number().int().nullable(),
  deltaRatio: z.number().nullable(),
  byAccount: z.array(
    z.object({
      accountId: z.string(),
      accountName: z.string().nullable(),
      currency: z.string().nullable(),
      archived: z.boolean(),
      fees: SpendMeasureSchema,
      shareOfTotal: z.number().nullable(),
    })
  ),
  byMonth: z.array(
    z.object({
      month: z.string(),
      fees: SpendMeasureSchema,
      byAccount: z.array(z.object({ accountId: z.string(), fees: SpendMeasureSchema })),
    })
  ),
  byTag: z.array(
    z.object({ tag: z.string(), fees: SpendMeasureSchema, shareOfTotal: z.number().nullable() })
  ),
});

/** Finance's summary window and cost-of-credit measure exposed to mobile clients. */
export const MobileFinanceSummarySchema = z.object({
  window: FinanceSummaryWindowSchema,
  costOfCredit: CostOfCreditSummarySchema,
});

/** The mobile summary fields selected from Finance's response envelope. */
export const FinanceSummaryResponseSchema = z.object({ data: MobileFinanceSummarySchema });

/** Validated response from the BFM mobile finance summary route. */
export type MobileFinanceSummary = z.infer<typeof MobileFinanceSummarySchema>;
