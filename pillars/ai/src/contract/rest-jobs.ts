/**
 * `jobs` sub-router — the shared per-pillar job-management surface.
 *
 * The routes are declared once in `@pops/pillar-jobs/contract` so every
 * producing pillar exposes the same shape and an aggregator can fan out
 * across them; this file only binds them to this pillar's error envelopes.
 *
 * 503 is in the set because job management is the one surface that answers
 * "this pillar has no Redis" — the default for ai — rather than pretending
 * an empty, healthy queue.
 */
import { makeJobsContract, type JobsContract } from '@pops/pillar-jobs/contract';

import { ERR_RESPONSES, ErrorBodySchema } from './rest-schemas.js';

export const aiJobsContract: JobsContract = makeJobsContract({
  ...ERR_RESPONSES,
  503: ErrorBodySchema,
});
