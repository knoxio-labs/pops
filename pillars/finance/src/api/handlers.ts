/**
 * Top-level request handlers for the finance pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express.
 */
import { getLastImportInfo } from '../db/services/transactions-reads.js';
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedFinanceDb } from '../db/index.js';
import type { ContactsClient } from './contacts/client.js';

/**
 * Threshold past which the health response flags import staleness. No
 * ingestion path (CSV import, the Up Bank webhook) should ever leave the
 * pillar silent for this long; a stale flag here is an ops signal to check
 * ingestion, not a hard failure — `/health` still returns 200.
 */
const IMPORT_STALE_THRESHOLD_DAYS = 14;

export interface FinanceApiDeps {
  /** Open handle to the finance pillar's SQLite. */
  financeDb: OpenedFinanceDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin finance-api is reachable at. Surfaced as the synthetic
   * `finance` entry in `GET /pillars` so consumers don't have to
   * special-case the host pillar.
   */
  selfBaseUrl: string;
  /**
   * Live client for the contacts pillar. The import matcher and entity-usage
   * rollup fetch the contact set through it per request (no local mirror).
   * Defaults to a `pillar('contacts')`-backed impl; tests inject a fake.
   */
  contacts: ContactsClient;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'finance';
  version: string;
  ts: string;
  import: {
    lastEditedTime: string | null;
    daysSinceLastImport: number | null;
    stale: boolean;
  };
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: FinanceApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.financeDb.raw.prepare('SELECT 1').get();
      const { lastEditedTime, daysSinceLastImport } = getLastImportInfo(deps.financeDb.db);
      return {
        ok: true,
        status: 'ok',
        pillar: 'finance',
        version: deps.version,
        ts: new Date().toISOString(),
        import: {
          lastEditedTime,
          daysSinceLastImport,
          stale:
            lastEditedTime !== null &&
            (daysSinceLastImport === null || daysSinceLastImport >= IMPORT_STALE_THRESHOLD_DAYS),
        },
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
