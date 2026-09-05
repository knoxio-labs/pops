/**
 * Express app factory for the finance pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 *
 * Auth is split by who is calling. An uncredentialled caller is still trusted
 * on the docker network — the shell's nginx and Cloudflare Access are the
 * perimeter for browser traffic. A caller that presents an `X-API-Key` is a
 * machine, and it is held to the service account behind that key: see
 * `middleware/service-account-scope.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { financeContract } from '../contract/rest.js';
import { type FinanceApiDeps, makeRequestHandler } from './handlers.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
import { makeUpWebhookIngest } from './modules/up-bank/webhook-ingest.js';
import { createRequestValidationErrorHandler } from './rest/error-mapping.js';
import { makeFinanceRestHandlers } from './rest/handlers.js';
import { makeServeLogo } from './rest/serve-logo.js';
import { createUpBankWebhookRouter } from './webhooks/up-bank.js';

/**
 * JSON body cap. Statement-import uploads will arrive as base64 strings in
 * the body once that domain lands; the limit sits well above express's
 * 100 kb default so those requests aren't rejected.
 */
const JSON_BODY_LIMIT = '20mb';

/**
 * The committed OpenAPI projection (`pillars/finance/openapi/finance.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/finance.openapi.json` lands
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
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'finance.openapi.json'),
    'utf8'
  )
);

export function createFinanceApiApp(deps: FinanceApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Up Bank signs the raw request bytes, so the webhook body must reach the
  // handler unparsed. The path-scoped raw parser MUST precede the global JSON
  // parser, which would otherwise consume the stream first.
  app.use('/webhooks/up', express.raw({ type: 'application/json' }));
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
  // scope) and before the contract surface, so every contract route is covered
  // without enumerating them here.
  app.use(
    createServiceAccountScopeMiddleware(
      deps.serviceAccountVerifier ?? createRegistryServiceAccountVerifier()
    )
  );

  // Binary logo serving — a plain Express route, not ts-rest (it streams raw
  // bytes, not JSON). Registered after the scope gate above so it runs
  // through the exact same middleware as every contract route, and before
  // the contract endpoints below, matching food's `serveHeroImage` ordering.
  app.get('/logos/:id', makeServeLogo(deps.financeDb.db));

  createExpressEndpoints(financeContract, makeFinanceRestHandlers(deps), app, {
    // ts-rest answers a schema mismatch itself, ahead of any handler, with its
    // own error body. Every route declaring a 400 declares `ErrorBody`, so
    // without this the document promises one shape and the server sends
    // another — see `rest/error-mapping.ts`.
    requestValidationErrorHandler: createRequestValidationErrorHandler(),
  });

  // Raw (non-ts-rest) webhook route. Mounted after the contract endpoints; its
  // `/webhooks/up` paths don't collide with any contract path, so it adds no
  // OpenAPI surface.
  app.use(
    createUpBankWebhookRouter({ ingest: makeUpWebhookIngest(deps.financeDb.db, deps.contacts) })
  );

  return app;
}
