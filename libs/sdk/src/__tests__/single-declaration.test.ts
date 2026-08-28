import { describe, expect, it } from 'vitest';

/**
 * ADR-049: the manifest wire shapes are declared once, in `@pops/types`, and
 * their TypeScript types are inferred from those declarations. This suite pins
 * that property at the seam it used to be broken at.
 *
 * POPS-2581 is the reason it exists. `SettingsGroup.widget` was added to the
 * TypeScript interface in `@pops/types` and emitted by `plexManifest`; the
 * `.strict()` Zod restatement in this package never gained the key, so
 * `bootstrapPillar` rejected media's own manifest and `pops-media-api`
 * restarted 11 times in production. Nothing failed earlier because the two
 * declarations were kept in step by convention across a package boundary.
 *
 * The assertions below are identity checks, not shape comparisons. A shape
 * comparison would be a third restatement of the same information, and would
 * pass the moment somebody reintroduced a mirror that happened to agree on the
 * day it was written — which is exactly the state that shipped POPS-2581. If
 * the validator ever stops using the schema `@pops/types` declares, these fail.
 */
import {
  FeatureDescriptorSchema,
  ModuleCaptureOverlayConfigSchema,
  SettingsManifestSchema,
  type SettingsGroup,
} from '@pops/types';

import { ManifestPayloadSchema } from '../manifest-schema/schema.js';
import { SettingsManifestDescriptorSchema } from '../manifest-schema/settings.js';
import { CaptureOverlayDescriptorSchema } from '../manifest-schema/ui.js';
import { validateManifestPayload } from '../manifest-schema/validate.js';
import { validManifest } from './fixtures.js';

function manifestWithSettingsGroup(group: unknown) {
  return {
    ...validManifest(),
    settings: {
      manifests: [{ id: 'finance', title: 'Finance', order: 10, groups: [group] }],
    },
  };
}

describe('the wire schema has no second declaration', () => {
  it('validates settings with the very schema @pops/types declares', () => {
    expect(SettingsManifestDescriptorSchema).toBe(SettingsManifestSchema);
  });

  it('validates the capture overlay with the very schema @pops/types declares', () => {
    expect(CaptureOverlayDescriptorSchema).toBe(ModuleCaptureOverlayConfigSchema);
  });

  it('reaches those schemas from the assembled payload schema, not just from the module', () => {
    const shape = ManifestPayloadSchema.shape;
    expect(shape.settings.unwrap().shape.manifests.element).toBe(SettingsManifestSchema);
    expect(shape.captureOverlay.unwrap()).toBe(ModuleCaptureOverlayConfigSchema);
    expect(shape.features.unwrap().element).toBe(FeatureDescriptorSchema);
  });
});

describe('POPS-2581 regression — a settings widget reaches the validator', () => {
  it('accepts the group shape media actually registers', () => {
    const group: SettingsGroup = {
      id: 'plex',
      title: 'Plex',
      fields: [],
      widget: { bundleSlot: 'plex-connect' },
    };

    const result = validateManifestPayload(manifestWithSettingsGroup(group));

    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it('still rejects a key no declaration carries, naming it', () => {
    const result = validateManifestPayload(
      manifestWithSettingsGroup({
        id: 'plex',
        title: 'Plex',
        fields: [],
        widget: { bundleSlot: 'plex-connect' },
        wodget: { bundleSlot: 'typo' },
      })
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((issue) => issue.field)).toEqual([
      'settings.manifests[0].groups[0].wodget',
    ]);
    expect(result.ok ? [] : result.issues.map((issue) => issue.reason)).toEqual(['unknown field']);
  });
});
