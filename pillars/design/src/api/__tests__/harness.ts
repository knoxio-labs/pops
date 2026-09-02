import { openTempDesignDb, type TempDb } from '../../db/__tests__/helpers.js';
/**
 * Standing up the real `createDesignApiApp` against a real, migrated database.
 *
 * Nothing here is a mock: the pillar's subject matter is what gets written to
 * and read back from that database, and a stubbed handle would let assertions
 * pass against code that persists nothing.
 */
import { createDesignApiApp } from '../app.js';

import type { Express } from 'express';

import type { DesignDb } from '../../db/index.js';

/**
 * `NODE_ENV=production` plus a configured Access team: the only combination
 * in which the identity middleware demands a real session. Every "an
 * anonymous caller is refused" assertion needs it — under the suite's own
 * `NODE_ENV=test` the dev fallback resolves every request to an operator, so
 * those cases would silently assert nothing.
 */
export const PRODUCTION_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CLOUDFLARE_ACCESS_TEAM_NAME: 'pops-test-team',
};

/**
 * Production with Access unconfigured. This pillar reads that as "trust the
 * tunnel", the registry's reading rather than bfm's — no hostname bypasses
 * Access to reach it.
 */
export const PRODUCTION_ENV_WITHOUT_ACCESS: NodeJS.ProcessEnv = { NODE_ENV: 'production' };

export interface TestApp {
  app: Express;
  db: DesignDb;
  opened: TempDb;
  cleanup: () => void;
}

export interface TestAppOptions {
  version?: string;
  env?: NodeJS.ProcessEnv;
}

export function createTestApp(options: TestAppOptions = {}): TestApp {
  const opened = openTempDesignDb();
  const app = createDesignApiApp({
    db: opened.db,
    version: options.version ?? 'test',
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  return { app, db: opened.db, opened, cleanup: opened.cleanup };
}
