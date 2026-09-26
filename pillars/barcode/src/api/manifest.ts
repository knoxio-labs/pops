import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

/** Stable registry id for this pillar. */
export const BARCODE_PILLAR_ID = 'barcode' as const;

/** Build the registry manifest for the barcode contract and health route. */
export function buildBarcodeManifest(version: string): ManifestPayload {
  return {
    pillar: BARCODE_PILLAR_ID,
    version,
    contract: {
      package: '@pops/barcode',
      version,
      tag: `contract-barcode@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
