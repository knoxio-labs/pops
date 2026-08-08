/**
 * Express app factory for the bfm pillar container.
 *
 * Kept as a factory so the test suite spins up an in-process `supertest`
 * instance without binding a real port.
 *
 * Every JSON route comes from the ts-rest contract via
 * `createExpressEndpoints` — including `/health`, which is a contract route
 * here rather than the hand-mounted probe the older pillars carry, so the
 * shape a caller parses and the shape the OpenAPI document promises cannot
 * drift apart.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { bfmContract } from '../contract/rest.js';
import { type BfmApiDeps, makeBfmRestHandlers } from './rest/handlers.js';

/**
 * The committed OpenAPI projection, served verbatim at `GET /openapi` so the
 * pillar SDK builds its `operationId` route map from the live pillar rather
 * than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/bfm.openapi.json` lands at
 * the package root in BOTH layouts: `src/api/app.ts` (dev) and
 * `dist/api/app.js` (prod, `outDir: dist` / `rootDir: src`), since `openapi/`
 * is a sibling of both `src/` and `dist/`.
 *
 * A RAW route, NOT a ts-rest contract route, so it never appears in the
 * generated document (`generate:openapi` is a pure projection of the
 * contract) — no drift. Read once at module load: the file is static.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'bfm.openapi.json'),
    'utf8'
  )
);

export function createBfmApiApp(deps: BfmApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  createExpressEndpoints(bfmContract, makeBfmRestHandlers(deps), app);

  return app;
}
