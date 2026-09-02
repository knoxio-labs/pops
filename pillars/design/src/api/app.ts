/**
 * The design pillar's comment API as an Express app, constructible without a
 * process — every test drives this rather than spawning `server.ts`.
 *
 * Routes sit at the root rather than under an `/api` prefix, because the
 * shell's nginx already supplies one: `/design-api/(.*)` is rewritten to
 * `/$1` before it reaches this process, exactly as it is for every other
 * pillar API. A second prefix here would make the public path
 * `/design-api/api/threads`.
 *
 * `/health` is mounted before the identity middleware on purpose: the
 * container healthcheck carries no Access session, and a health route that
 * needed one would report a correctly-running pillar as unhealthy.
 */
import express, { Router, type Express } from 'express';

import { createIdentityMiddleware } from './middleware/identity.js';
import { mountThreadRoutes } from './threads-routes.js';

import type { DesignDb } from '../db/index.js';

export interface CreateDesignApiAppOptions {
  db: DesignDb;
  version: string;
  /** Injectable for tests; defaults to the ambient environment. */
  env?: NodeJS.ProcessEnv;
}

/** The pillar id this API answers as, in `/health` and in log lines. */
export const DESIGN_PILLAR_ID = 'design';

export function createDesignApiApp(options: CreateDesignApiAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      status: 'ok',
      pillar: DESIGN_PILLAR_ID,
      version: options.version,
      ts: new Date().toISOString(),
    });
  });

  const api = Router();
  api.use(createIdentityMiddleware(options.env ?? process.env));
  mountThreadRoutes(api, options.db);
  app.use(api);

  return app;
}
