/**
 * `dataQuality.*` sub-router — the dashboard's nudge feed (POPS-2881,
 * ADR-051).
 *
 * An inconsistency is already flagged inline on the account page
 * (`AccountBalance.inconsistent`, POPS-2879); this is the same fact rolled up
 * across every account for the dashboard's nudge panel (POPS-250), which owns
 * drawing it. This endpoint owns the data so the panel never has to fan out
 * to every account's balance itself.
 *
 * `Nudge` is a discriminated union with one member today. POPS-250 and the
 * staleness ticket (POPS-2890, outside this epic) add members without
 * changing the envelope — a caller switches on `kind` and ignores what it
 * does not recognise.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { NudgeSchema } from './rest-data-quality-schemas.js';

const c = initContract();

export const financeDataQualityContract = c.router({
  nudges: {
    method: 'GET',
    path: '/data-quality/nudges',
    responses: { 200: z.object({ data: z.array(NudgeSchema) }) },
    summary:
      'Data-quality nudges for the dashboard panel — one per account with a checkpoint ' +
      'inconsistency, largest |delta| first',
  },
});
