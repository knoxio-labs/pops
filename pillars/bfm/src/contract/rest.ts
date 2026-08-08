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
 * - **device** (`/mobile/*`) — on bfm's own tunnel hostname with Access
 *   bypassed, behind `requireDevice`. The pairing exchange (POPS-1374) and
 *   refresh (POPS-1375) land there too, not beside the operator router.
 *
 * `/health` belongs to neither and answers on both.
 *
 * Each surface is a sub-router rather than a set of flat keys, so its routes
 * group under one `<surface>.*` operationId namespace — the same
 * `<domain>.<proc>` addressing the pillar SDK's route map keys on. Everything
 * under `mobile` answers below the prefix `requireDevice` is mounted on, so a
 * route declared there cannot arrive public.
 */
import { initContract } from '@ts-rest/core';

import { bfmOperatorContract } from './rest-operator.js';
import {
  HealthResponseSchema,
  MobileAuthErrorSchema,
  MobileBootstrapResponseSchema,
  MobileRateLimitErrorSchema,
} from './rest-schemas.js';

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
    mobile: c.router({
      bootstrap: {
        method: 'GET',
        path: '/mobile/bootstrap',
        responses: {
          200: MobileBootstrapResponseSchema,
          401: MobileAuthErrorSchema,
          403: MobileAuthErrorSchema,
          // Answered by the perimeter middleware, never by the handler, but
          // declared here because the generated Swift client is the only thing
          // that decides what the phone can parse — and a launching app that
          // hits the budget receives this and nothing else.
          429: MobileRateLimitErrorSchema,
        },
        summary: 'What the app should render, and who the federation says it is talking to',
      },
    }),
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type BfmContract = typeof bfmContract;
