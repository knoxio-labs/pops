import { z } from 'zod';

import {
  AppPathSchema,
  I18nKeySchema,
  KebabIdentifierSchema,
  ModuleCaptureOverlayConfigSchema,
  type ModuleCaptureOverlayConfig,
} from '@pops/types';

const NAV_COLOR = z.enum(['emerald', 'indigo', 'amber', 'rose', 'sky', 'violet']);

const NAV_ITEM_DESCRIPTOR = z
  .object({
    path: z.string(),
    label: z.string().min(1),
    labelKey: I18nKeySchema,
    icon: KebabIdentifierSchema,
  })
  .strict();

/**
 * Wire-shaped descriptor of a pillar's app-rail entry. Mirrors the
 * `AppNavConfig` shape the shell consumes today (`apps/pops-shell/src/app/nav/types.ts`),
 * minus the runtime `IconName` enum dependency — icons travel the wire as
 * kebab-case identifiers and resolve to Lucide components shell-side.
 *
 * `order` is required: PRD-243 moves app-rail ordering off the
 * `registeredApps` array index and onto the manifest. Ties break
 * lexicographically by `id`.
 */
export const NavConfigDescriptorSchema = z
  .object({
    id: KebabIdentifierSchema,
    label: z.string().min(1),
    labelKey: I18nKeySchema,
    icon: KebabIdentifierSchema,
    color: NAV_COLOR.optional(),
    basePath: AppPathSchema,
    order: z.number().int(),
    items: z.array(NAV_ITEM_DESCRIPTOR),
  })
  .strict();

/**
 * Wire-shaped descriptor of a routable page contributed by a pillar.
 * Carries the routing surface the shell consumes today; React component
 * refs come from the workspace bundle map at the shell side (US-03), so
 * the descriptor names a `bundleSlot` instead of carrying a component
 * directly.
 */
export const PageDescriptorSchema = z
  .object({
    path: z.string(),
    index: z.boolean().optional(),
    bundleSlot: KebabIdentifierSchema,
  })
  .strict();

/**
 * Absolute URL where a pillar's frontend bundle is served from. Reserved
 * for the external-pillar UI loading mechanism (PRD-243 US-05, deferred).
 * Validated at the wire layer in US-01; not consumed by the shell today.
 */
export const AssetsBaseUrlSchema = z.string().url();

/**
 * Wire-shaped descriptor of a pillar's capture overlay contribution. Declared
 * once in `@pops/types` as `ModuleCaptureOverlayConfigSchema` and re-exported
 * here under the manifest payload's name for it (ADR-049) — the shell
 * discovers overlays through the manifest registry the same way it discovers
 * `nav` / `pages` (PRD-243) and mounts the React component resolved from the
 * workspace bundle map, with no shell-side edit naming the pillar (PRD-246).
 */
export const CaptureOverlayDescriptorSchema = ModuleCaptureOverlayConfigSchema;

export type NavConfigDescriptor = z.infer<typeof NavConfigDescriptorSchema>;
export type NavItemDescriptor = z.infer<typeof NAV_ITEM_DESCRIPTOR>;
export type PageDescriptor = z.infer<typeof PageDescriptorSchema>;
export type CaptureOverlayDescriptor = ModuleCaptureOverlayConfig;
