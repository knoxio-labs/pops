/**
 * Scalar schemas the manifest shapes are built from.
 *
 * These live here rather than in `@pops/pillar-sdk` because the shapes that
 * use them are now declared once, here, and inferred into TypeScript
 * (ADR-049). The SDK's wire schema imports them so a pattern is written once
 * — a regex restated in two packages is the same hazard as a field restated
 * in two packages, at a smaller scale.
 *
 * Every one erases to `string`, so the TypeScript types inferred from the
 * shapes that use them are unaffected by which pattern applies.
 */
import { z } from 'zod';

/** Lowercase kebab-case pillar id, e.g. `finance`, `bfm`, `pops-shell`. */
export const PillarIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'pillar id must be lowercase kebab-case');

/**
 * camelCase identifier — `ai.tools[].name`, `search.adapters[].name`, a
 * capability key. No dots, no hyphens. See
 * [ADR-036](../../../docs/architecture/adr-036-pillar-id-tool-name-conventions.md).
 */
export const CamelIdentifierSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'must be camelCase identifier');

/** Lowercase kebab-case identifier — bundle slots, search entity types. */
export const KebabIdentifierSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'must be lowercase kebab-case identifier');

/** `<pillar>.<router>.<procedure>` — a procedure a pillar actually serves. */
export const ProcedurePathSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/,
    'must match <pillar>.<router>.<procedure>'
  );

/** Dotted lower-camel settings key, e.g. `media.plex.scheduler`. */
export const SettingsKeySchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/, 'must be dotted.lower.camel');

/** An i18n catalog key. Non-empty; the catalog is the only real validator. */
export const I18nKeySchema = z.string().min(1);

/** An in-app path. Absolute so the shell can route it without a base. */
export const AppPathSchema = z.string().regex(/^\//, 'must start with /');
