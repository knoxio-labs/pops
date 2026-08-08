import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildDocumentsManifest } from '../manifest.js';

describe('buildDocumentsManifest', () => {
  it('produces a manifest that passes registry validation (schema + cross-field)', () => {
    const result = validateManifestPayload(buildDocumentsManifest('1.2.3'));

    expect(result.ok).toBe(true);
  });

  it('registers under the documents pillar id with a matching contract package', () => {
    const manifest = buildDocumentsManifest('1.2.3');

    expect(manifest.pillar).toBe('documents');
    expect(manifest.contract.package).toBe('@pops/documents');
    expect(manifest.contract.tag).toBe('contract-documents@v1.2.3');
  });

  it('declares no search or ai surface in this scaffold increment', () => {
    const manifest = buildDocumentsManifest('1.2.3');

    expect(manifest.search.adapters).toEqual([]);
    expect(manifest.ai.tools).toEqual([]);
    expect(manifest.routes.queries).toEqual([]);
    expect(manifest.routes.mutations).toEqual([]);
  });

  it('declares the document uri type it can resolve', () => {
    const manifest = buildDocumentsManifest('1.2.3');

    expect(manifest.uri.types).toEqual(['documents/document']);
  });

  it('declares the /health healthcheck path', () => {
    const manifest = buildDocumentsManifest('1.2.3');

    expect(manifest.healthcheck).toEqual({ path: '/health' });
  });
});
