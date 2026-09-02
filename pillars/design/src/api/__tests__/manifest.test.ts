import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildDesignManifest, DESIGN_PILLAR_ID } from '../manifest.js';

describe('buildDesignManifest', () => {
  it('produces a manifest that passes registry validation (schema + cross-field)', () => {
    const result = validateManifestPayload(buildDesignManifest('1.2.3'));

    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('registers under the id the shell renders the /design-api/ block from', () => {
    const manifest = buildDesignManifest('1.2.3');

    expect(DESIGN_PILLAR_ID).toBe('design');
    expect(manifest.pillar).toBe(DESIGN_PILLAR_ID);
    expect(manifest.contract.package).toBe('@pops/design');
    expect(manifest.contract.tag).toBe('contract-design@v1.2.3');
    expect(manifest.contract.version).toBe('1.2.3');
  });

  it('declares an empty cross-pillar surface — the playground publishes nothing', () => {
    const manifest = buildDesignManifest('1.2.3');

    expect(manifest.search.adapters).toEqual([]);
    expect(manifest.ai.tools).toEqual([]);
    expect(manifest.uri.types).toEqual([]);
    expect(manifest.routes.queries).toEqual([]);
    expect(manifest.routes.mutations).toEqual([]);
    expect(manifest.routes.subscriptions).toEqual([]);
  });

  it('points the healthcheck at the path the API actually serves', () => {
    expect(buildDesignManifest('dev').healthcheck.path).toBe('/health');
  });
});
