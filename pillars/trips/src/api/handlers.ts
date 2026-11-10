import { trips } from '../db/schema.js';
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedTripsDb } from '../db/index.js';
import type { ContactReferenceResolver } from './rest/contact-reference.js';

/** Dependencies for the trips pillar's liveness and roster probes. */
export interface TripsApiDeps {
  readonly tripsDb: OpenedTripsDb;
  readonly version: string;
  readonly selfBaseUrl: string;
  /** Complete authenticated identity snapshot override; undefined means unavailable, never empty. */
  readonly fetchSharedTagIds?: () => Promise<readonly string[] | undefined>;
  /** Contacts owner-proof seam; retained identities, self and clear never call it. */
  readonly resolveContactReference?: ContactReferenceResolver;
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
      deps.tripsDb.db.select({ id: trips.id }).from(trips).limit(1).get();
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
