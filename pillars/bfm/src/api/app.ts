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
 *
 * The one exception to "the contract describes everything" is the `/mobile`
 * perimeter below, which is Express middleware because it must answer paths
 * the contract does not declare. See `auth/README.md`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { bfmContract } from '../contract/rest.js';
import { createRequireDevice } from './auth/require-device.js';
import { type BfmRestHandlerDeps, makeBfmRestHandlers } from './rest/handlers.js';

import type { KeyObject } from 'node:crypto';

import type { BfmDb } from '../db/index.js';

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

/**
 * The path prefix every route the phone calls lives under, and therefore the
 * one the guard mounts on.
 *
 * A single prefix rather than a per-route list is the point: `app.use` matches
 * on whole path segments, so everything below `/mobile` is gated the moment it
 * exists and nothing below it can be added ungated by accident.
 */
export const MOBILE_PATH_PREFIX = '/mobile';

export interface BfmApiDeps extends BfmRestHandlerDeps {
  /** Backs the guard's device lookup — the allow-list a token is checked against. */
  db: BfmDb;
  /**
   * Verifies the bearer token on every `/mobile/*` request. Required rather
   * than optional: an app that could be built without one would be an app
   * whose perimeter can go missing silently.
   */
  accessTokenSigningKey: KeyObject;
}

export function createBfmApiApp(deps: BfmApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // FIRST, ahead of the body parser. The guard reads headers only, so an
  // unauthenticated caller never gets bfm to parse a request body — which is
  // the cheapest work an internet-facing pillar can be made to do, and there
  // is nothing bounding how often it can be asked for (POPS-1468).
  //
  // It is also ahead of the contract routes, so it covers the `/mobile/*`
  // paths that do not exist yet. `/health` and `/openapi` sit outside the
  // prefix and are deliberately unauthenticated — the fleet's probes and the
  // SDK's route-map build both reach them without a device.
  app.use(
    MOBILE_PATH_PREFIX,
    createRequireDevice({ db: deps.db, accessTokenSigningKey: deps.accessTokenSigningKey })
  );

  app.use(express.json());

  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  createExpressEndpoints(bfmContract, makeBfmRestHandlers(deps), app);

  return app;
}
