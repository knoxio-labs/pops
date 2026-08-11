/**
 * Express app factory for the purchases pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest` instance
 * without binding a real port.
 *
 * Auth is split by who is calling. An uncredentialled caller is still admitted
 * — the ingest CLI, the operator smoke script and the two-process test all
 * reach this pillar with no key, and it has no credentialled caller at all. A
 * caller that presents an `X-API-Key` is a machine, and is held to the service
 * account behind that key: see `middleware/service-account-scope.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { purchasesContract } from '../contract/rest.js';
import { makeRequestHandler, type PurchasesApiDeps } from './handlers.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
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
const JSON_BODY_LIMIT = '20mb';

export function createPurchasesApiApp(deps: PurchasesApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

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

  createExpressEndpoints(purchasesContract, makePurchasesRestHandlers(deps), app);

  return app;
}
