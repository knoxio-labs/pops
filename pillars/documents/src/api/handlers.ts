/**
 * Top-level request handlers for the documents pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. The documents pillar owns no
 * domain DB — it bridges paperless-ngx — so `health` is a pure liveness
 * shape rather than a DB round-trip (contrast the data pillars, which
 * touch SQLite to surface a dead handle).
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

export interface DocumentsApiDeps {
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin documents-api is reachable at. Surfaced as the
   * synthetic `documents` entry in `GET /pillars` so consumers don't
   * have to special-case the host pillar.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'documents';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: DocumentsApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      return {
        ok: true,
        status: 'ok',
        pillar: 'documents',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
