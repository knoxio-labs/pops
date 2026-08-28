/**
 * Validates the manifest ai actually registers with, through the same
 * validator `bootstrapPillar` runs at boot.
 *
 * POPS-2581: a manifest the wire validator rejects does not degrade the
 * pillar, it kills it — `bootstrapPillar` throws before the server is
 * registered and the container restart-loops. ADR-049 closed the shape-drift
 * half of that (the manifest shapes are declared once now), but the validator
 * also enforces cross-field rules and pattern refinements no type can carry —
 * a `procedurePath` naming a procedure this pillar does not serve, a contract
 * tag that disagrees with the version. Those still fail first at boot unless
 * something emits the real payload, which is what this does.
 */
import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildAiManifest } from '../ai-manifest.js';

describe('buildAiManifest', () => {
  it('passes the SDK wire validator the registry bootstrap uses', () => {
    const result = validateManifestPayload(buildAiManifest('0.1.0'));

    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
