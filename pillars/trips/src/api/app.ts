import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createPillarErrorHandlers } from '@pops/pillar-express';
import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { tripsContract } from '../contract/rest.js';
import { makeRequestHandler, type TripsApiDeps } from './handlers.js';
import { buildTripsManifest } from './manifest.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
import { makeTripsRestHandlers } from './rest/handlers.js';

import type { AccessIdentityOptions } from '@pops/pillar-express';
import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'trips.openapi.json'),
    'utf8'
  )
);

/** Dependencies for creating an in-process trips Express app. */
export interface CreateTripsApiAppDeps extends TripsApiDeps {
  /** Test-only Cloudflare Access verifier configuration for in-process apps. */
  readonly accessIdentity?: AccessIdentityOptions;
  readonly serviceAccountVerifier?: ServiceAccountVerifier;
}

/** Create the trips HTTP app without binding a port. */
export function createTripsApiApp(deps: CreateTripsApiAppDeps): Express {
  const app = express();
  const errors = createPillarErrorHandlers({ pillar: 'trips' });
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
  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  app.get('/manifest.json', (_req: Request, res: Response) => {
    res.json(buildTripsManifest(deps.version));
  });

  app.use(
    createServiceAccountScopeMiddleware(
      deps.serviceAccountVerifier ?? createRegistryServiceAccountVerifier(),
      deps.accessIdentity
    )
  );
  createExpressEndpoints(tripsContract, makeTripsRestHandlers(deps), app, {
    requestValidationErrorHandler: errors.validation,
  });

  app.use(errors.notFound);
  app.use(errors.final);

  return app;
}
