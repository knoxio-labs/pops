import { z } from 'zod';

import { SettingsManifestSchema, type SettingsManifest } from '@pops/types';

/**
 * Settings UI contribution descriptor — peer of `SinkDescriptor`,
 * `SEARCH_ADAPTER`, and `AI_TOOL`.
 *
 * This module no longer restates the settings shape. `@pops/types` declares it
 * once, as a Zod schema, and infers its TypeScript types from that schema
 * (ADR-049); here it is only lifted into the manifest payload's `settings`
 * slot. The restatement this file used to hold is what let
 * `SettingsGroup.widget` exist on the TypeScript side and not the wire side,
 * crash-looping `pops-media-api` on boot (POPS-2581 / PRD-240 US-01 /
 * ADR-037).
 */
export const SettingsManifestDescriptorSchema = SettingsManifestSchema;

export const SettingsBlockSchema = z
  .object({
    manifests: z.array(SettingsManifestDescriptorSchema),
  })
  .strict();

export type SettingsManifestDescriptor = SettingsManifest;
