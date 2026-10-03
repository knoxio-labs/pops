import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedTagsDb } from '../db/index.js';

/** Dependencies for the tags pillar's liveness and roster probes. */
export interface TagsApiDeps {
  readonly tagsDb: OpenedTagsDb;
  readonly version: string;
  readonly selfBaseUrl: string;
}

/** JSON shape returned by `GET /health`. */
export interface HealthResponse {
  readonly ok: true;
  readonly status: 'ok';
  readonly pillar: 'tags';
  readonly version: string;
  readonly ts: string;
}

/** JSON shape returned by `GET /pillars`. */
export interface PillarsResponse {
  readonly pillars: readonly PillarRegistryEntry[];
}

/** Build the probe handlers around the opened tags database. */
export function makeRequestHandler(deps: TagsApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      deps.tagsDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'tags',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
