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
import { createMobileRateLimit, type MobileRateLimitOptions } from './auth/mobile-rate-limit.js';
import { createRequireDevice } from './auth/require-device.js';
import { createIdentityMiddleware } from './middleware/identity.js';
import { MOBILE_PATH_PREFIX } from './paths.js';
import { type BfmRestHandlerDeps, makeBfmRestHandlers } from './rest/handlers.js';
import { createRequestValidationErrorHandler } from './rest/request-validation.js';

import type { KeyObject } from 'node:crypto';

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

/** Re-exported so existing callers keep one import; defined in `paths.ts`. */
export { MOBILE_PATH_PREFIX } from './paths.js';

export interface BfmApiDeps extends BfmRestHandlerDeps {
  /**
   * Verifies the bearer token on every `/mobile/*` request. Required rather
   * than optional: an app that could be built without one would be an app
   * whose perimeter can go missing silently.
   */
  accessTokenSigningKey: KeyObject;
  /**
   * Overrides for the perimeter's request budget. Optional because *whether*
   * the limiter runs is not a choice — it is mounted unconditionally below —
   * only what its numbers and clock are, which is what a test needs to drive
   * the limit rather than assert the configuration object.
   */
  mobileRateLimit?: MobileRateLimitOptions;
}

export interface CreateBfmApiAppOptions {
  /**
   * Environment the operator identity middleware resolves against. A parameter
   * rather than an ambient `process.env` read so a test can exercise the
   * production branch — under `NODE_ENV=test` every caller would otherwise
   * resolve to the dev-fallback operator, and the "an anonymous caller is
   * refused" cases could not be written at all.
   */
  env?: NodeJS.ProcessEnv;
}

export function createBfmApiApp(deps: BfmApiDeps, options: CreateBfmApiAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');

  // FIRST, ahead of everything, including the guard.
  //
  // `requireDevice` fails closed and costs little, but an HMAC verification
  // per attempt with nothing bounding the attempt rate is still unbounded
  // work, and this hostname has Cloudflare Access bypassed so no other
  // limiter stands in front of it (POPS-1468). A refused request costs a map
  // lookup instead of a signature check.
  app.use(MOBILE_PATH_PREFIX, createMobileRateLimit(deps.mobileRateLimit).handler);

  // Then the guard, still ahead of the body parser. It reads headers only, so
  // an unauthenticated caller never gets bfm to parse a request body — which
  // is the cheapest work an internet-facing pillar can be made to do.
  //
  // Both are ahead of the contract routes, so they cover both the `/mobile/*`
  // routes the contract declares and the ones it does not yet. `/health` and
  // `/openapi` sit outside the prefix and are deliberately unauthenticated and
  // unlimited — the fleet's probes and the SDK's route-map build both reach
  // them without a device, and a liveness probe that a stranger's traffic can
  // rate-limit out of existence would report this pillar down for the wrong
  // reason.
  app.use(
    MOBILE_PATH_PREFIX,
    createRequireDevice({ db: deps.db, accessTokenSigningKey: deps.accessTokenSigningKey })
  );

  app.use(express.json());

  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  // The OPERATOR principal, a different axis from the `/mobile` guard above:
  // that one authenticates a phone, this one authenticates a human through
  // Cloudflare Access for the `/operator/*` routes. Mounted before the
  // endpoints so every handler sees it on `res.locals`. It resolves and never
  // rejects — `/health`, `/openapi` and the device-facing pairing exchange
  // (POPS-1374) are anonymous by design, and per-route gating is the handler's
  // job.
  app.use(createIdentityMiddleware(options.env));

  createExpressEndpoints(bfmContract, makeBfmRestHandlers(deps), app, {
    // ts-rest answers a schema mismatch itself, before any handler, with its
    // own error body. Left alone, a `/mobile` route would promise one 400
    // shape in the document the iOS client is generated from and emit
    // another — see `rest/request-validation.ts`.
    requestValidationErrorHandler: createRequestValidationErrorHandler(),
  });

  return app;
}
