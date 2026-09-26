import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { barcodeContract } from '../contract/rest.js';
import { makeRequestHandler, type BarcodeApiDeps } from './handlers.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
import { makeBarcodeRestHandlers } from './rest/handlers.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

import type { BarcodeLookupService } from '../lookup/service.js';

const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'barcode.openapi.json'),
    'utf8'
  )
);

/** Dependencies for creating an in-process barcode Express app. */
export interface CreateBarcodeApiAppDeps extends BarcodeApiDeps {
  readonly lookupService: BarcodeLookupService;
  readonly serviceAccountVerifier?: ServiceAccountVerifier;
}

/**
 * Create the barcode HTTP app without binding a port.
 *
 * The raw probe routes are mounted before the mandatory service-account gate;
 * only the ts-rest lookup contract is credentialled.
 */
export function createBarcodeApiApp(deps: CreateBarcodeApiAppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

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

  app.use(
    createServiceAccountScopeMiddleware(
      deps.serviceAccountVerifier ?? createRegistryServiceAccountVerifier()
    )
  );
  createExpressEndpoints(barcodeContract, makeBarcodeRestHandlers(deps), app);

  return app;
}
