/**
 * Validates the manifest media actually registers with, through the same
 * validator the registry bootstrap runs.
 *
 * POPS-2581: `SettingsGroup.widget` was added to `@pops/types` for the Plex PIN
 * flow (POPS-67) and `plexManifest` started emitting
 * `widget: { bundleSlot: 'plex-connect' }`, but the SDK's hand-mirrored wire
 * schema (`manifest-schema/settings.ts`) is `.strict()` and did not know the
 * key. `bootstrapPillar` rejected media's own manifest and the pillar
 * crash-looped in production — 11 restarts before it was caught.
 *
 * Nothing failed earlier because the two shapes were mirrored by hand across a
 * package boundary: `@pops/types` held the TypeScript source of truth and the
 * Zod schema was the wire validator, so a field added to one type-checked fine
 * while the other rejected it at runtime. ADR-049 removed that mirror — the
 * shapes are declared once, in Zod, and the types are inferred from them.
 *
 * This test stays because the validator enforces more than shape: cross-field
 * rules and pattern refinements no type can carry still fail first at boot
 * unless something emits the real payload.
 */
import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildMediaManifest } from '../manifest.js';

describe('media manifest payload', () => {
  it('passes the SDK wire validator the registry bootstrap uses', () => {
    const result = validateManifestPayload(buildMediaManifest('0.1.0'));

    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('still declares the Plex connect widget the validator has to accept', () => {
    const { settings } = buildMediaManifest('0.1.0');
    const widgets = (settings?.manifests ?? []).flatMap((manifest) =>
      manifest.groups.flatMap((group) => (group.widget ? [group.widget.bundleSlot] : []))
    );

    expect(widgets).toContain('plex-connect');
  });
});
