import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedBarcodeDb } from '../db/index.js';

/** Dependencies for the barcode pillar's liveness and roster probes. */
export interface BarcodeApiDeps {
  readonly barcodeDb: OpenedBarcodeDb;
  readonly version: string;
  readonly selfBaseUrl: string;
}

/** JSON shape returned by `GET /health`. */
export interface HealthResponse {
  readonly ok: true;
  readonly status: 'ok';
  readonly pillar: 'barcode';
  readonly version: string;
  readonly ts: string;
}

/** JSON shape returned by `GET /pillars`. */
export interface PillarsResponse {
  readonly pillars: readonly PillarRegistryEntry[];
}

/** Build the probe handlers around one opened barcode database. */
export function makeRequestHandler(deps: BarcodeApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      deps.barcodeDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'barcode',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
