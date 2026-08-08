import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildBfmManifest } from '../manifest.js';

describe('buildBfmManifest', () => {
  it('produces a manifest that passes registry validation (schema + cross-field)', () => {
    const result = validateManifestPayload(buildBfmManifest('1.2.3'));

    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('registers under the bfm pillar id with a matching contract package and tag', () => {
    const manifest = buildBfmManifest('1.2.3');

    expect(manifest.pillar).toBe('bfm');
    expect(manifest.contract.package).toBe('@pops/bfm');
    expect(manifest.contract.tag).toBe('contract-bfm@v1.2.3');
    expect(manifest.contract.version).toBe('1.2.3');
  });

  it('declares an empty cross-pillar surface — bfm publishes nothing to the fleet', () => {
    const manifest = buildBfmManifest('1.2.3');

    expect(manifest.search.adapters).toEqual([]);
    expect(manifest.ai.tools).toEqual([]);
    expect(manifest.uri.types).toEqual([]);
    expect(manifest.routes.queries).toEqual([]);
    expect(manifest.routes.mutations).toEqual([]);
    expect(manifest.consumedSettings.keys).toEqual([]);
  });

  it('points the healthcheck at the path the contract actually serves', () => {
    expect(buildBfmManifest('1.2.3').healthcheck).toEqual({ path: '/health' });
  });

  // Not a claim about what gets registered: `bootstrapPillar` coerces a
  // non-semver version to `0.0.0-sha.<short>` (and rewrites the tag to match)
  // *before* it validates, so a `dev` build does register. What this pins is
  // that the builder emits nothing the schema would wave through on its own —
  // the version and the tag it derives have to stay in lockstep.
  it('emits a payload the schema rejects when handed a non-semver version', () => {
    const result = validateManifestPayload(buildBfmManifest('not-a-semver'));

    expect(result.ok).toBe(false);
  });
});
