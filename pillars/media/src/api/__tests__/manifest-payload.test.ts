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
 * Nothing failed earlier because the two shapes are mirrored by hand across a
 * package boundary: `@pops/types` is the TypeScript source of truth and the Zod
 * schema is the wire validator, so a field added to one type-checks fine while
 * the other rejects it at runtime. This test closes that loop for media by
 * asserting the real payload parses.
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
