/**
 * Validates the manifest finance actually registers with, through the same
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

import { buildFinanceManifest } from '../manifest.js';

describe('buildFinanceManifest', () => {
  it('passes the SDK wire validator the registry bootstrap uses', () => {
    const manifest = buildFinanceManifest('0.1.0');
    const result = validateManifestPayload(manifest);

    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(manifest.tags).toEqual({ carriers: [{ entityType: 'transaction' }] });
    expect(manifest.routes.queries).toContain('finance.tagged.list');
    expect(manifest.routes.mutations).toEqual(
      expect.arrayContaining(['finance.tagged.attach', 'finance.tagged.detach'])
    );
  });

  // The contract's marks are only worth anything if they reach the registry:
  // the shell filters on the manifest it walks, never on the contract.
  it('carries the guest marks onto the wire', () => {
    const manifest = buildFinanceManifest('0.1.0');

    expect(
      (manifest.pages ?? []).filter((page) => page.access === 'guest').map((page) => page.path)
    ).toEqual(['transactions', 'accounts', 'accounts/:id']);
    expect(
      (manifest.nav?.items ?? []).filter((item) => item.access === 'guest').map((item) => item.path)
    ).toEqual(['/transactions', '/accounts']);
    expect((manifest.pages ?? []).some((page) => page.access === 'operator')).toBe(false);
  });
});
