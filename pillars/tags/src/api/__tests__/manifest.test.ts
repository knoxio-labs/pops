import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildTagsManifest } from '../manifest.js';

describe('buildTagsManifest', () => {
  it('passes registry validation and declares the list route', () => {
    const manifest = buildTagsManifest('1.2.3');

    expect(validateManifestPayload(manifest).ok).toBe(true);
    expect(manifest.pillar).toBe('tags');
    expect(manifest.contract.package).toBe('@pops/tags');
    expect(manifest.contract.tag).toBe('contract-tags@v1.2.3');
    expect(manifest.routes.queries).toEqual(['tags.tags.list']);
    expect(manifest.healthcheck).toEqual({ path: '/health' });
  });
});
