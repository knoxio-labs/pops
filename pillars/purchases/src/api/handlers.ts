/**
 * Request handlers for the purchases pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';
import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedPurchasesDb } from '../db/index.js';
import type { ReceiptVision } from '../ingest/receipt/vision.js';
import type { MerchantResolver } from './contacts/merchant.js';
import type { SweepTrigger } from './rest/reconcile-handlers.js';

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
  /** Runs a sweep on demand, for `POST /reconcile/sweep`. */
  sweep?: SweepTrigger;
  /**
   * Reads photographed receipts. Null declines every upload with a 503 —
   * the drop-zone is optional, and a pillar without an API key should say
   * so at the edge rather than accept uploads it cannot read.
   *
   * Required, not optional: an omitted port is indistinguishable from a
   * deliberate null, and that is exactly how the production wiring came to
   * be missing while every test injected its own fake and passed.
   */
  vision: ReceiptVision | null;
  /** Names the merchant against contacts. Injectable so tests stay offline. */
  merchant?: MerchantResolver;
  /**
   * Resolves a presented `X-API-Key` to its service account. Defaults to a
   * registry-backed verifier; tests inject a fake so no test needs a live
   * registry.
   */
  serviceAccountVerifier?: ServiceAccountVerifier;
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
