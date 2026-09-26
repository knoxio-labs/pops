import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildBarcodeManifest } from '../manifest.js';

describe('buildBarcodeManifest', () => {
  it('passes registry validation', () => {
    expect(validateManifestPayload(buildBarcodeManifest('1.2.3')).ok).toBe(true);
  });

  it('declares the barcode contract and open health route', () => {
    const manifest = buildBarcodeManifest('1.2.3');

    expect(manifest.pillar).toBe('barcode');
    expect(manifest.contract.package).toBe('@pops/barcode');
    expect(manifest.contract.tag).toBe('contract-barcode@v1.2.3');
    expect(manifest.healthcheck).toEqual({ path: '/health' });
    expect(manifest.search.adapters).toEqual([]);
    expect(manifest.ai.tools).toEqual([]);
  });
});
