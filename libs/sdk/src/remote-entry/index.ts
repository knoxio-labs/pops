/**
 * What a pillar's remote entry exports beside `bundles`, for the shell's
 * runtime loader (`pillars/shell/src/app/external-ui.tsx`) to install before
 * it mounts anything from the bundle.
 *
 * Declared once, as a Zod schema with the type inferred from it (ADR-049):
 * the pillar writes its export against the type, and the loader validates the
 * module namespace it imported against the same schema.
 */
import { z } from 'zod';

/**
 * Every locale the frontend ships. The shell offers exactly these in its
 * switcher, and a pillar's translations must cover each of them.
 */
export const SUPPORTED_LOCALES = ['en-AU', 'pt-BR'] as const;

/** One of {@link SUPPORTED_LOCALES}. */
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The locale i18next falls back to when a key is missing in the active one,
 * and the one every other locale's key set is checked against.
 */
export const DEFAULT_LOCALE: SupportedLocale = 'en-AU';

/**
 * A pillar's translations: one namespace, with a catalogue for every
 * supported locale.
 *
 * The shell's i18next instance is created with `createInstance()`, so a
 * remote bundle cannot register resources by importing `i18next` itself —
 * that reaches the module's default instance, which nothing renders from. The
 * pillar hands its catalogues over as this export instead, and the loader adds
 * them to the shell's instance before the pillar's first component mounts.
 *
 * `resources` is exhaustive over {@link SUPPORTED_LOCALES}: a pillar that
 * drops a locale fails validation rather than rendering English inside a
 * Portuguese shell through the fallback.
 */
export const RemotePillarI18nSchema = z.object({
  namespace: z.string().min(1),
  resources: z.record(z.enum(SUPPORTED_LOCALES), z.record(z.string(), z.unknown())),
});

/** A pillar remote entry's `i18n` export; see {@link RemotePillarI18nSchema}. */
export type RemotePillarI18n = z.infer<typeof RemotePillarI18nSchema>;
