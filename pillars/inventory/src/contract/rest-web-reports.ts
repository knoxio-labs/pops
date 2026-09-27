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

/** One active item and its report provenance for the inventory web reports. */
export const WebReportEntrySchema = z.object({
  itemId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  typeKey: z.string().nullable(),
  isContainer: z.boolean(),
  quantity: z.number().int(),
  /** Per unit, as stored on the item. */
  replacementValue: z.number().nullable(),
  purchasePrice: z.number().nullable(),
  purchasedOn: z.string().nullable(),
  warrantyExpires: z.string().nullable(),
  /** The Paperless document id of the first receipt linked to the item. */
  receiptId: z.number().int().nullable(),
  photos: z.number().int().nonnegative(),
  effectiveLocationId: z.string().nullable(),
  /** The room containing the item, or the in-hand/unknown fallback. */
  room: z.object({ key: z.string(), label: z.string() }),
  /** The effective location's name, or null while in hand or unresolved. */
  place: z.string().nullable(),
});

/** All active inventory entries consumed by the web report tabs. */
export const WebReportEntriesResponseSchema = z.object({
  entries: z.array(WebReportEntrySchema),
});

/** REST router for reports consumed by the inventory web application. */
export const inventoryWebReportsContract = c.router({
  entries: {
    method: 'GET',
    path: '/web/reports/entries',
    responses: { 200: WebReportEntriesResponseSchema },
    summary: 'Active inventory report entries with provenance and effective placement',
  },
  values: {
    method: 'GET',
    path: '/web/reports/values',
    query: WebValueReportQuerySchema,
    responses: { 200: WebValueReportResponseSchema, 400: ErrorBodySchema },
    summary: 'Replacement and purchase values grouped by room or catalogue type',
  },
});
