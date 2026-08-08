/**
 * REST contract for the bfm pillar — ts-rest single source of truth.
 *
 * `generateOpenApi(bfmContract, …)` projects this to
 * `openapi/bfm.openapi.json`, which the pillar serves verbatim at
 * `GET /openapi`. Nothing else in the tree describes the bfm wire format:
 * don't hand-author OpenAPI, and don't hand-author paths in `app.ts`.
 *
 * Two surfaces live here, on two hostnames, and the split is the pillar's
 * whole security model:
 *
 * - **operator** (`/operator/*`) — behind Cloudflare Access via the shell's
 *   nginx at `/bfm-api/`, gated per route on a resolved principal.
 * - **device** — on bfm's own tunnel hostname with Access bypassed. The
 *   pairing exchange (POPS-1374), refresh (POPS-1375) and the mobile routes
 *   (POPS-1378, POPS-1379) land there, not beside the operator router.
 *
 * `/health` belongs to neither and answers on both.
 */
import { initContract } from '@ts-rest/core';

import { bfmOperatorContract } from './rest-operator.js';
import { HealthResponseSchema } from './rest-schemas.js';

const c = initContract();

export const bfmContract = c.router(
  {
    health: {
      method: 'GET',
      path: '/health',
      responses: { 200: HealthResponseSchema },
      summary: 'Liveness shape. Answers without a database round-trip',
    },
    operator: bfmOperatorContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type BfmContract = typeof bfmContract;
