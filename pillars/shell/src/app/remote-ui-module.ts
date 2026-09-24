import { parseRemoteTranslations } from './remote-translations';

import type { ComponentType } from 'react';

import type { RemotePillarI18n } from '@pops/pillar-sdk';

/**
 * The contract an external pillar's remote ESM bundle must satisfy.
 *
 * The bundle is fetched via `import(assetsBaseUrl)`; its module namespace is
 * expected to expose a `bundles` record keyed by the kebab-case
 * `PageDescriptor.bundleSlot` ids the pillar declares in its manifest. Each
 * value is a zero-prop-required React component the shell mounts under the
 * matching route. Keeping the contract to "a record of components" avoids
 * leaking the shell's router/React types across the wire boundary while
 * still being fully typed on the shell side.
 *
 * Beside it, the pillar's translations as `i18n` (`RemotePillarI18n`, declared
 * in `@pops/pillar-sdk`). Optional at this boundary: a bundle without it
 * mounts with raw keys and a warning rather than not at all.
 */
export interface RemotePillarUiModule {
  readonly bundles: Readonly<Record<string, ComponentType>>;
  readonly i18n?: RemotePillarI18n | undefined;
}

/**
 * Narrow an unknown dynamic-import result to `RemotePillarUiModule`. Throws a
 * descriptive `Error` (never returns a partial) so the lazy-import promise
 * rejects and the surrounding `<ErrorBoundary>` renders the fallback. An
 * absent `i18n` export is not an error; one that is present and does not
 * match `RemotePillarI18nSchema` is.
 *
 * @param value The module namespace the bundle's `import()` resolved to.
 * @param pillarId The pillar the bundle belongs to, for error messages.
 */
export function assertRemoteUiModule(value: unknown, pillarId: string): RemotePillarUiModule {
  if (typeof value !== 'object' || value === null || !('bundles' in value)) {
    throw new Error(`external pillar '${pillarId}' bundle does not export a 'bundles' record`);
  }
  const bundles = (value as { bundles: unknown }).bundles;
  if (typeof bundles !== 'object' || bundles === null) {
    throw new Error(`external pillar '${pillarId}' bundle 'bundles' export is not an object`);
  }
  const i18n = 'i18n' in value ? parseRemoteTranslations(value.i18n, pillarId) : undefined;
  return { bundles: bundles as Readonly<Record<string, ComponentType>>, i18n };
}
