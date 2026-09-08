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
 * Where a pillar's frontend bundle is served from — the URL the shell's
 * runtime loader `import()`s (`pillars/shell/src/app/external-ui.tsx`).
 *
 * Either an absolute `http(s)` URL, for a pillar hosting its own assets on
 * another origin, or a root-relative path, for one served through the shell's
 * own nginx. The relative form is not a convenience: an in-repo pillar has no
 * way to know the origin the browser reached the shell on — a LAN name, a
 * Tailscale name and `localhost` all reach the same deployment — so an
 * absolute URL would have to be configured per host and would be wrong on the
 * others. It also keeps the module request same-origin, which is what makes
 * the shared-runtime import map apply to it without any CORS posture at all.
 */
export const AssetsBaseUrlSchema = z
  .string()
  .refine(
    (value) => value.startsWith('/') || /^https?:\/\//.test(value),
    'must be an absolute http(s) URL or a root-relative path'
  )
  .refine((value) => !value.startsWith('//'), 'must not be protocol-relative')
  .refine(
    (value) => !value.startsWith('/') || URL.canParse(value, 'http://placeholder.invalid'),
    'must be a well-formed path'
  );

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
