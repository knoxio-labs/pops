import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedTripsDb } from '../db/index.js';

/** Dependencies for the trips pillar's liveness and roster probes. */
export interface TripsApiDeps {
  readonly tripsDb: OpenedTripsDb;
  readonly version: string;
  readonly selfBaseUrl: string;
}

/** JSON shape returned by `GET /health`. */
export interface HealthResponse {
  readonly ok: true;
  readonly status: 'ok';
  readonly pillar: 'trips';
  readonly version: string;
  readonly ts: string;
}

/** JSON shape returned by `GET /pillars`. */
export interface PillarsResponse {
  readonly pillars: readonly PillarRegistryEntry[];
}

/** Build the probe handlers around the opened trips database. */
export function makeRequestHandler(deps: TripsApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      deps.tripsDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'trips',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
