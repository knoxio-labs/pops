/**
 * Registering a loader-mounted pillar's translations with the shell's
 * i18next instance.
 *
 * The shell registers only the shared namespaces at init. Each pillar ships
 * its own catalogues as its remote entry's `i18n` export (`RemotePillarI18n`
 * in `@pops/pillar-sdk`), and this adds them the first time the pillar's
 * bundle is loaded, before any of its components mount — so a pillar's first
 * paint reads its own strings, and switching locale re-renders it like any
 * other shell text.
 */
import { RemotePillarI18nSchema, SUPPORTED_LOCALES, type RemotePillarI18n } from '@pops/pillar-sdk';

import shellI18n from '../i18n';

import type { i18n as I18n } from 'i18next';

const handled = new WeakMap<I18n, Set<string>>();

/**
 * Validate a bundle's `i18n` export against `RemotePillarI18nSchema`.
 *
 * `undefined` passes through: a bundle without translations still mounts.
 * Anything else that does not match throws, naming the pillar, so the loader's
 * error boundary shows the placeholder rather than a pillar registering a
 * namespace with a locale missing.
 *
 * @param value The module namespace's `i18n` binding, unvalidated.
 * @param pillarId The pillar the bundle belongs to, for the error message.
 * @returns The validated translations, or `undefined` when there were none.
 */
export function parseRemoteTranslations(
  value: unknown,
  pillarId: string
): RemotePillarI18n | undefined {
  if (value === undefined) return undefined;
  const parsed = RemotePillarI18nSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `external pillar '${pillarId}' bundle 'i18n' export is malformed: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

/**
 * Add a pillar's catalogues to `instance`, once per pillar.
 *
 * Every supported locale is added with `deep` and `overwrite` set, so the
 * pillar's copy of its own namespace is authoritative.
 *
 * Never throws. A bundle with no `i18n` export still mounts: its pages render
 * raw keys, and a warning names the pillar — the same trade the stylesheet
 * makes, since the shell has no better page to put in its place.
 *
 * @param pillarId The pillar whose bundle was loaded; keys the once-only guard.
 * @param translations The bundle's validated `i18n` export, if it had one.
 * @param instance The i18next instance to register with; the shell's own by
 *   default, injectable for tests.
 */
export function installRemoteTranslations(
  pillarId: string,
  translations: RemotePillarI18n | undefined,
  instance: I18n = shellI18n
): void {
  let seen = handled.get(instance);
  if (seen === undefined) {
    seen = new Set();
    handled.set(instance, seen);
  }
  if (seen.has(pillarId)) return;
  seen.add(pillarId);

  if (translations === undefined) {
    console.warn(
      `[external-ui] pillar '${pillarId}' bundle exports no 'i18n'; its strings will render as keys`
    );
    return;
  }
  for (const locale of SUPPORTED_LOCALES) {
    instance.addResourceBundle(
      locale,
      translations.namespace,
      translations.resources[locale],
      true,
      true
    );
  }
}
