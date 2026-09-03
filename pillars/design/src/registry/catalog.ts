import { discoverExperiments } from './experiments';
import { linkExperimentsToScreens } from './lineage';
import { collectScreens } from './screens';

import type { Catalog } from './types';

/**
 * The filesystem is the registry. Every glob below names a place a file can
 * sit to be discovered; nothing is registered anywhere. The globs are literal
 * strings on purpose — Vite resolves them at build time, and a variable would
 * defeat that.
 *
 * Screens are matched at any depth: the folders above a screen file group the
 * sidebar, and a folder is a flow of steps only when it holds a `flow.yaml`.
 */
const screenModules = import.meta.glob<Record<string, unknown>>('../screens/**/*.tsx', {
  eager: true,
});
const screenFlows = import.meta.glob<string>('../screens/**/flow.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const experimentYamls = import.meta.glob<string>('../experiments/*/experiment.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const variantModules = import.meta.glob<Record<string, unknown>>(
  '../experiments/*/variants/*/screens/**/*.tsx',
  { eager: true }
);
const variantFlows = import.meta.glob<string>('../experiments/*/variants/*/screens/**/flow.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export function buildCatalog(): Catalog {
  const errors: string[] = [];
  const screens = collectScreens({
    modules: screenModules,
    flowMarkers: screenFlows,
    prefix: 'screens/',
    errors,
  });
  const experiments = discoverExperiments(
    { yamls: experimentYamls, modules: variantModules, flowMarkers: variantFlows },
    errors
  );
  linkExperimentsToScreens(screens, experiments, errors);
  return { screens, experiments, errors };
}

/** Discovered once per document; the tree does not change at runtime. */
export const catalog: Catalog = buildCatalog();
