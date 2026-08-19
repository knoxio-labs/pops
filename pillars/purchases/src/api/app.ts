/**
 * Express app factory for the purchases pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest` instance
 * without binding a real port.
 *
 * Auth is split by who is calling. An uncredentialled caller is still admitted
 * — browser traffic arrives through the shell's nginx with no key, and the
 * two-process test drives this pillar without one. A caller that presents an
 * `X-API-Key` is a machine, and is held to the service account behind that key: see
 * `middleware/service-account-scope.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { purchasesContract } from '../contract/rest.js';
import { makeRequestHandler, type PurchasesApiDeps } from './handlers.js';
import { jsonBodyErrorHandler } from './middleware/json-body-error.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
import { unmatchedRouteHandler } from './middleware/unmatched-route.js';
import { createRequestValidationErrorHandler } from './rest/error-mapping.js';
import { makePurchasesRestHandlers } from './rest/handlers.js';

/**
 * The committed OpenAPI projection, served verbatim at `GET /openapi` so
 * the pillar SDK can build its route map from the live pillar rather than a
 * vendored copy.
 *
 * Resolved relative to this module — `../../openapi/purchases.openapi.json`
 * lands at the package root in BOTH layouts: `src/api/app.ts` (dev) and
 * `dist/api/app.js` (prod, `outDir: dist` / `rootDir: src`), since
 * `openapi/` is a sibling of both `src/` and `dist/`.
 *
 * This is a RAW route, NOT a ts-rest contract route, so it does not appear
 * in the generated document (`generate:openapi` is a pure projection of the
 * contract) — no drift. Read once at module load: the file is static.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'purchases.openapi.json'),
    'utf8'
  )
);

/**
 * One order is one request, and a grocery shop is ~100 lines with tags,
 * units, per-line charge allocations and documents — measured at ~39kb,
 * which clears Express's 100kb default but not by much. A bigger shop, or
 * longer product names, would start rejecting legitimate ingests with a
 * 413 that reads like a server fault. Matches the limit finance, food,
 * inventory, media and cerebrum already set.
 */
export const JSON_BODY_LIMIT_BYTES = 20 * 1024 * 1024;

/**
 * Test-only override for {@link JSON_BODY_LIMIT_BYTES}, scoped the same way
 * `service-account-scope.ts`'s `REQUIRE_CREDENTIAL_ENV` is: it only takes
 * effect outside production, so a stray value left on this env var in a
 * real deployment cannot shrink the ceiling every legitimate order relies
 * on. Exists so a live-seam suite can exercise this pillar's own body-limit
 * enforcement — the real `express.json()` middleware refusing a real body —
 * without generating something actually large enough to cross the 20mb
 * default.
 */
export const TEST_JSON_BODY_LIMIT_BYTES_ENV = 'PURCHASES_TEST_JSON_BODY_LIMIT_BYTES';

/**
 * Exported so the resolution rule is unit-testable without re-loading this
 * module under a different `process.env`, matching `resolveRequireCredential`.
 */
export function resolveJsonBodyLimitBytes(env: NodeJS.ProcessEnv = process.env): number {
  if (env['NODE_ENV'] === 'production') return JSON_BODY_LIMIT_BYTES;
  const raw = env[TEST_JSON_BODY_LIMIT_BYTES_ENV];
  if (raw === undefined || raw === '') return JSON_BODY_LIMIT_BYTES;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : JSON_BODY_LIMIT_BYTES;
}

export function createPurchasesApiApp(deps: PurchasesApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: resolveJsonBodyLimitBytes() }));
  app.use(jsonBodyErrorHandler);

  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  // Inbound service-account gate. Mounted after the raw probes (which carry no
  // scope) and before the contract surface, so every contract route is covered
  // without enumerating them here.
  app.use(
    createServiceAccountScopeMiddleware(
      deps.serviceAccountVerifier ?? createRegistryServiceAccountVerifier()
    )
  );

  createExpressEndpoints(purchasesContract, makePurchasesRestHandlers(deps), app, {
    // ts-rest answers a schema mismatch itself, ahead of any handler, with its
    // own error body. Every route declaring a 400 declares `ErrorBody`, so
    // without this the document promises one shape and the server sends
    // another — see `rest/error-mapping.ts`.
    requestValidationErrorHandler: createRequestValidationErrorHandler(),
  });

  // After the raw probes and the whole contract surface: anything still
  // unmatched here is a genuine 404, logged rather than left to Express's
  // silent default. See `middleware/unmatched-route.ts`.
  app.use(unmatchedRouteHandler);

  return app;
}
