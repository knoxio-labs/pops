/**
 * Express app factory for the documents pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest, plus the raw
 * paperless thumbnail proxy. Kept as a factory so the test suite can spin
 * up an in-process `supertest` instance without binding a real port.
 *
 * Contract and thumbnail routes validate presented service-account keys.
 * The inventory bridge call has no key and retains the network-perimeter
 * posture; the health, pillars and OpenAPI probes stay outside the gate.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createPillarErrorHandlers, defineErrors } from '@pops/pillar-express';
import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { documentsContract } from '../contract/rest.js';
import { createDocumentsFilesRouter } from './files/router.js';
import { type DocumentsApiDeps, makeRequestHandler } from './handlers.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
import { makeDocumentsRestHandlers } from './rest/handlers.js';

/**
 * The committed OpenAPI projection (`pillars/documents/openapi/documents.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/documents.openapi.json` lands
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
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'documents.openapi.json'),
    'utf8'
  )
);

const documentsErrors = defineErrors('documents', {
  invalid: {
    area: 'request',
    status: 400,
    message: 'The request is invalid.',
    retryable: false,
  },
});

/** Build the documents app with contract and thumbnail service-account scopes. */
export function createDocumentsApiApp(deps: DocumentsApiDeps): Express {
  const app = express();
  const errors = createPillarErrorHandlers({ pillar: 'documents' });
  app.disable('x-powered-by');
  app.use(errors.requestId);
  app.use(express.json());
  app.use(errors.bodyParser);

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

  app.use(
    createServiceAccountScopeMiddleware(
      deps.serviceAccountVerifier ?? createRegistryServiceAccountVerifier()
    )
  );

  createExpressEndpoints(documentsContract, makeDocumentsRestHandlers(), app, {
    requestValidationErrorHandler: (error, _req, _res, next) => {
      try {
        documentsErrors.invalid({ issues: validationIssues(error) });
      } catch (failure) {
        next(failure);
      }
    },
  });

  // Raw (non-ts-rest) byte-serving route for the Paperless thumbnail proxy.
  // Mounted after the contract endpoints; its `/documents/:id/thumbnail`
  // path doesn't collide with any contract path, so it adds no OpenAPI
  // surface.
  app.use(createDocumentsFilesRouter());

  app.use(errors.notFound);
  app.use(errors.final);

  return app;
}

function validationIssues(error: {
  pathParams?: { issues: readonly unknown[] } | null;
  headers?: { issues: readonly unknown[] } | null;
  query?: { issues: readonly unknown[] } | null;
  body?: { issues: readonly unknown[] } | null;
}): unknown[] {
  return [error.pathParams, error.headers, error.query, error.body].flatMap((value) =>
    value === null || value === undefined ? [] : [...value.issues]
  );
}
