/**
 * `ai-pricing.*` sub-router — cross-pillar pricing read.
 *
 * `GET /ai-pricing/:provider/:model` returns the configured per-million-token USD pair
 * `{ input, output }` already shaped as the `@pops/ai-telemetry` `PricingEntry`,
 * so cross-pillar callers do NOT re-derive it from `inputCostPerMtok` /
 * `outputCostPerMtok`. Public-readable (NOT internal) — the telemetry wrapper's
 * `httpLookupPricing` fetches it before `computeCostUsd`. A provider/model pair
 * without configured pricing returns 404.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

const PricingParams = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const PricingEntrySchema = z.object({
  input: z.number(),
  output: z.number(),
});

export const aiPricingContract = c.router({
  lookup: {
    method: 'GET',
    path: '/ai-pricing/:provider/:model',
    pathParams: PricingParams,
    responses: { 200: PricingEntrySchema, ...ERR_RESPONSES },
    summary: 'Resolve per-Mtok USD pricing { input, output } for a provider/model',
  },
});
