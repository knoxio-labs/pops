/**
 * Express app factory for the inventory pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 *
 * Auth is split by who is calling. An uncredentialled caller is still
 * admitted — browser traffic arrives through the shell's nginx with no key,
 * and callers on the docker network that present none must keep working. A
 * caller that presents an `X-API-Key` is a machine, and is held to the
 * service account behind that key: see `middleware/service-account-scope.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { inventoryContract } from '../contract/rest.js';
import { createInventoryFilesRouter } from './files/router.js';
import { type InventoryApiDeps, makeRequestHandler } from './handlers.js';
import { createInventoryMediaRouter } from './media/router.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
import { getInventoryImagesDir } from './modules/photos/paths.js';
import { makeInventoryRestHandlers } from './rest/handlers.js';

/**
 * JSON body cap. Photo / document uploads arrive as base64 strings in the
 * body; a 10 MiB file is ~13.7 MB of base64, so the limit sits above that
 * (express defaults to 100 kb, which would reject every upload).
 */
const JSON_BODY_LIMIT = '20mb';

/**
 * The committed OpenAPI projection (`pillars/inventory/openapi/inventory.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/inventory.openapi.json` lands
 * at the package root in BOTH layouts: `src/api/app.ts` (dev) and
 * `dist/api/app.js` (prod, `outDir: dist` / `rootDir: src`), since `openapi/`
 * is a sibling of both `src/` and `dist/`.
 *
 * This is a RAW route, NOT a ts-rest contract route, so it does not appear in
 * the generated document (`generate:openapi` is a pure projection of the
 * contract) — no drift. Read once at module load: the file is static.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'inventory.openapi.json'),
    'utf8'
  )
);

export function createInventoryApiApp(deps: InventoryApiDeps): Express {
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

  // Self-describing OpenAPI surface. Serves the committed projection verbatim
  // so a sibling pillar / the pillar SDK can build its operationId route map
  // against the live pillar. Raw route — intentionally NOT a ts-rest contract
  // route, so it never appears in the generated document.
  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  // Inbound service-account gate. Mounted after the raw probes (which carry no
  // scope) and before the contract surface and the raw byte routers, so every
  // contract route and every declared raw route is covered.
  app.use(
    createServiceAccountScopeMiddleware(
      deps.serviceAccountVerifier ?? createRegistryServiceAccountVerifier()
    )
  );

  createExpressEndpoints(inventoryContract, makeInventoryRestHandlers(deps), app);

  // Raw (non-ts-rest) byte-serving routes for item photos, direct-upload docs,
  // and the Paperless thumbnail proxy. Mounted after the contract endpoints;
  // their `/api/inventory/...` + `/inventory/documents/:id/thumbnail` paths
  // don't collide with any contract path, so they add no OpenAPI surface.
  app.use(createInventoryFilesRouter());

  // Raw content-addressed media routes (Inventory ADR-002 D9): `PUT`/`GET
  // /media/:sha256`. Also deliberately NOT ts-rest — see `media/router.ts`.
  app.use(
    createInventoryMediaRouter({ db: deps.inventoryDb.db, imagesDir: getInventoryImagesDir })
  );

  return app;
}
