/**
 * `summary.*` sub-router — the dashboard's and the assistant's single
 * analytical read (POPS-3589, POPS-250 decision 2).
 *
 * One endpoint rather than two because the alternative is the same
 * aggregation SQL written twice: the dashboard reduces it into panels, the MCP
 * hands it to a model, and both want exactly the same numbers for the same
 * window. Aggregating here is also what stops the browser paging the whole
 * ledger in to reduce it locally.
 *
 * Read-only and idempotent: no route in this sub-router writes.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';
import { FinanceSummarySchema } from './rest-summary-schemas.js';
import { MAX_SUMMARY_TOP_LIMIT, SUMMARY_WINDOWS } from './summary-windows.js';

const c = initContract();

const SummaryQuery = z.object({
  /** Defaults to `30d` — see `summary-windows.ts` for why not a calendar month. */
  window: z.enum(SUMMARY_WINDOWS).optional(),
  /** Rows in the tag and entity breakdowns. String on the wire; coerced. */
  topLimit: z.coerce.number().int().positive().max(MAX_SUMMARY_TOP_LIMIT).optional(),
});

export const financeSummaryContract = c.router({
  get: {
    method: 'GET',
    path: '/summary',
    query: SummaryQuery,
    responses: { 200: z.object({ data: FinanceSummarySchema }), ...ERR_RESPONSES },
    summary:
      'Spend for a window and the period before it, broken down by account, month, tag and ' +
      'entity, with the largest charge, concentration, subscriptions and foreign spend',
  },
});
