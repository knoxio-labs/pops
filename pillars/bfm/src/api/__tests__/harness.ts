/**
 * Standing up the real `createBfmApiApp` for a test.
 *
 * The app requires a database handle and a signing key because the `/mobile`
 * perimeter cannot be optional — which means every test that wants `/health`
 * needs both too. This exists so that cost is one line rather than six, and so
 * a test never reaches for a stub where a real SQLite file would do.
 */
import { createSecretKey, type KeyObject } from 'node:crypto';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { createBfmApiApp } from '../app.js';

import type { Express } from 'express';

import type { BfmDb } from '../../db/index.js';

/** Long enough to satisfy the resolver's floor; fixed so a failure is reproducible. */
export const TEST_SIGNING_SECRET = 'test-signing-key-0123456789abcdef';

export function testSigningKey(secret: string = TEST_SIGNING_SECRET): KeyObject {
  return createSecretKey(Buffer.from(secret, 'utf8'));
}

export interface TestApp {
  app: Express;
  db: BfmDb;
  accessTokenSigningKey: KeyObject;
  cleanup: () => void;
}

export function createTestApp(version = '0.0.1-test'): TestApp {
  const { opened, cleanup } = openTempDb();
  const accessTokenSigningKey = testSigningKey();
  return {
    app: createBfmApiApp({ version, db: opened.db, accessTokenSigningKey }),
    db: opened.db,
    accessTokenSigningKey,
    cleanup,
  };
}
