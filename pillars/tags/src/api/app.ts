import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { createRegistryServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { tagsContract } from '../contract/rest.js';
import { makeRequestHandler, type TagsApiDeps } from './handlers.js';
import { createServiceAccountScopeMiddleware } from './middleware/service-account-scope.js';
import { makeTagsRestHandlers } from './rest/handlers.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'tags.openapi.json'),
    'utf8'
  )
);

/** Dependencies for creating an in-process tags Express app. */
export interface CreateTagsApiAppDeps extends TagsApiDeps {
  readonly serviceAccountVerifier?: ServiceAccountVerifier;
}

/** Create the tags HTTP app without binding a port. */
export function createTagsApiApp(deps: CreateTagsApiAppDeps): Express {
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
  createExpressEndpoints(tagsContract, makeTagsRestHandlers(deps), app);

  return app;
}
