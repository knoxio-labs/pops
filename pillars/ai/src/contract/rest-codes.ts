/**
 * `codes.*` sub-router — candidate-code ranking for the inventory pillar's
 * `codes/suggest` (POPS-4130).
 *
 * `POST /codes/rank` takes the deterministic candidates inventory's
 * `suggestCodes` already computed and returns them reordered,
 * most-likely-first. It never invents a code: the response MUST be a
 * permutation of `candidates` (`../api/modules/ai-codes/ranker.ts` guarantees
 * this by construction, and the caller re-validates it — see
 * `pillars/inventory/src/api/ai/client.ts`'s `isPermutation`). Gated by the
 * service-account scope `ai.codes.rank` (`api/middleware/service-account-scope.ts`);
 * an uncredentialled caller is still admitted, matching every other pillar's
 * ADR-044 posture, so this route's shape stays public even though today's
 * only caller sends a key.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

const CodesRankRequestSchema = z.object({
  name: z.string().min(1),
  typeKey: z.string().min(1).optional(),
  candidates: z.array(z.string().min(1)).min(1),
});

const CodesRankResponseSchema = z.object({
  ranked: z.array(z.string().min(1)),
});

export const aiCodesContract = c.router({
  rank: {
    method: 'POST',
    path: '/codes/rank',
    body: CodesRankRequestSchema,
    responses: {
      200: CodesRankResponseSchema,
      400: ErrorBodySchema,
      403: z.object({ message: z.string() }),
    },
    summary: 'Rank candidate inventory codes most-likely-first (deterministic, no model call)',
  },
});
