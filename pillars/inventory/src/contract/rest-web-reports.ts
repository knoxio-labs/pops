import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/** Groupings supported by the inventory web values report. */
export const VALUE_REPORT_GROUPINGS = ['room', 'type'] as const;

/** Value bases supported by the inventory web values report. */
export const VALUE_REPORT_BASES = ['replacement', 'purchase'] as const;

/** Query parameters for the inventory web values report. */
export const WebValueReportQuerySchema = z.object({
  by: z.enum(VALUE_REPORT_GROUPINGS).default('room'),
  basis: z.enum(VALUE_REPORT_BASES).default('replacement'),
});

/** One item entry in a web values report group. */
export const ValueReportEntrySchema = z.object({
  itemId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  typeKey: z.string().nullable(),
  isContainer: z.boolean(),
  quantity: z.number().int(),
  unitValue: z.number().nullable(),
  value: z.number().nullable(),
});

/** One room or catalogue-type group in a web values report. */
export const ValueReportGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  records: z.number().int(),
  unvalued: z.number().int(),
  share: z.number().min(0).max(1),
  entries: z.array(ValueReportEntrySchema),
});

/** Headline totals for the inventory web values report. */
export const ValueReportTotalsSchema = z.object({
  records: z.number().int(),
  units: z.number().int(),
  replacement: z.number(),
  purchase: z.number(),
  unvalued: z.number().int(),
  withoutPhoto: z.number().int(),
});

/** Complete response for the inventory web values report. */
export const WebValueReportResponseSchema = z.object({
  totals: ValueReportTotalsSchema,
  groups: z.array(ValueReportGroupSchema),
});

/** REST router for reports consumed by the inventory web application. */
export const inventoryWebReportsContract = c.router({
  values: {
    method: 'GET',
    path: '/web/reports/values',
    query: WebValueReportQuerySchema,
    responses: { 200: WebValueReportResponseSchema, 400: ErrorBodySchema },
    summary: 'Replacement and purchase values grouped by room or catalogue type',
  },
});
