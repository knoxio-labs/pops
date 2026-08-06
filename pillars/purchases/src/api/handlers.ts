/**
 * Request handlers for the purchases pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedPurchasesDb } from '../db/index.js';

export interface PurchasesApiDeps {
  /** Open handle to the purchases pillar's SQLite. */
  purchasesDb: OpenedPurchasesDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin purchases-api is reachable at. Surfaced as the synthetic
   * `purchases` entry in `GET /pillars`.
   */
  selfBaseUrl: string;
  /** Fired after a successful ingest — trigger 1 of the reconciliation sweep. */
  onIngest?: () => void;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'purchases';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: PurchasesApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error (caught
      // by the Express error pipeline -> 500) rather than a bogus 200 OK
      // that hides a broken connection.
      deps.purchasesDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'purchases',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
