/**
 * Express app factory for the ai pillar container.
 *
 * Serves the ts-rest `aiContract` surface (mounted via `createExpressEndpoints`)
 * plus the raw `/health`, `/pillars`, and `/openapi` routes ts-rest cannot
 * model. The cross-pillar ingest `POST /ai-usage/record` is internal-only: the
 * {@link INTERNAL_PATH_SCOPES} gate 403s any request lacking a valid per-caller
 * credential; nginx never proxies it either. `/ai-pricing/*` is NOT internal —
 * cross-pillar callers fetch it to shape pricing before `computeCostUsd`.
 *
 * Kept as a factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import {
  INTERNAL_CREDENTIAL_HEADER,
  type InternalCallerSpec,
  authenticateInternal,
  parseInternalCallers,
} from '@pops/pillar-sdk/server';

import { aiContract } from '../contract/rest.js';
import { type AiApiDeps, makeRequestHandler } from './handlers.js';
import { makeAiRestHandlers } from './rest/handlers.js';

/**
 * Scope naming the telemetry-ingest procedure. A caller must hold it to reach
 * {@link INTERNAL_PATH_SCOPES}'s `/ai-usage/record`.
 */
const AI_USAGE_SCOPE = 'ai.usage.record';

/**
 * Paths that trust ONLY an internal credential, never the docker network, each
 * mapped to the scope it requires. The cross-pillar telemetry sink is the sole
 * entry today; nginx does not proxy it.
 */
const INTERNAL_PATH_SCOPES = new Map([['/ai-usage/record', AI_USAGE_SCOPE]]);

/**
 * The callers this pillar accepts for its internal paths (ADR-039 E22). Each
 * presents `name.secret` in {@link INTERNAL_CREDENTIAL_HEADER}; the secret comes
 * from the named env var (blank ⇒ that caller is revoked). Every model-calling
 * pillar reports usage through `@pops/ai-telemetry`, plus the one-shot ops
 * backfill.
 */
const ACCEPTED_CALLERS: readonly InternalCallerSpec[] = [
  { name: 'finance', scopes: [AI_USAGE_SCOPE], secretEnv: 'POPS_INTERNAL_SECRET_FINANCE' },
  { name: 'cerebrum', scopes: [AI_USAGE_SCOPE], secretEnv: 'POPS_INTERNAL_SECRET_CEREBRUM' },
  { name: 'food-worker', scopes: [AI_USAGE_SCOPE], secretEnv: 'POPS_INTERNAL_SECRET_FOOD_WORKER' },
  { name: 'purchases', scopes: [AI_USAGE_SCOPE], secretEnv: 'POPS_INTERNAL_SECRET_PURCHASES' },
  {
    name: 'ops-backfill',
    scopes: [AI_USAGE_SCOPE],
    secretEnv: 'POPS_INTERNAL_SECRET_OPS_BACKFILL',
  },
];

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  // `req.get` normalises a possibly-repeated header to a single string so a
  // client sending a header more than once (→ `string[]`) is not spuriously
  // rejected.
  const result = authenticateInternal({
    path: req.path,
    credentialHeader: req.get(INTERNAL_CREDENTIAL_HEADER),
    config: {
      pathScopes: INTERNAL_PATH_SCOPES,
      callers: parseInternalCallers(ACCEPTED_CALLERS, process.env),
    },
  });
  if (!result.ok) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }
  next();
}

/**
 * The committed OpenAPI projection (`pillars/ai/openapi/ai.openapi.json`),
 * served verbatim at `GET /openapi`. Resolved relative to this module —
 * `../../openapi/ai.openapi.json` lands at the package root in BOTH layouts
 * (`src/api/app.ts` dev, `dist/api/app.js` prod), since `openapi/` is a sibling
 * of both `src/` and `dist/`. RAW route, NOT a ts-rest contract route, so it
 * never appears in the generated document — no drift.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'ai.openapi.json'),
    'utf8'
  )
);

export function createAiApiApp(deps: AiApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));
  app.use(requireInternalToken);

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

  createExpressEndpoints(aiContract, makeAiRestHandlers(deps), app);

  return app;
}
