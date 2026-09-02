import { discoverExperiments } from './experiments';
import { linkExperimentsToScreens } from './lineage';
import { collectScreens } from './screens';

import type { Catalog } from './types';

/**
 * The filesystem is the registry. Every glob below names a place a file can
 * sit to be discovered; nothing is registered anywhere. The globs are literal
 * strings on purpose — Vite resolves them at build time, and a variable would
 * defeat that.
 */
const screenLeaves = import.meta.glob<Record<string, unknown>>('../screens/*/*.tsx', {
  eager: true,
});
const screenSteps = import.meta.glob<Record<string, unknown>>('../screens/*/*/*.tsx', {
  eager: true,
});
const screenTooDeep = import.meta.glob<Record<string, unknown>>('../screens/*/*/*/*.tsx', {
  eager: true,
});
const experimentYamls = import.meta.glob<string>('../experiments/*/experiment.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const variantLeaves = import.meta.glob<Record<string, unknown>>(
  '../experiments/*/variants/*/screens/*/*.tsx',
  { eager: true }
);
const variantSteps = import.meta.glob<Record<string, unknown>>(
  '../experiments/*/variants/*/screens/*/*/*.tsx',
  { eager: true }
);
const variantTooDeep = import.meta.glob<Record<string, unknown>>(
  '../experiments/*/variants/*/screens/*/*/*/*.tsx',
  { eager: true }
);

export function buildCatalog(): Catalog {
  const errors: string[] = [];
  const screens = collectScreens({
    leafModules: screenLeaves,
    flowModules: screenSteps,
    deepModules: screenTooDeep,
    prefix: 'screens/',
    errors,
  });
  const experiments = discoverExperiments(
    {
      yamls: experimentYamls,
      leafModules: variantLeaves,
      flowModules: variantSteps,
      deepModules: variantTooDeep,
    },
    errors
  );
  linkExperimentsToScreens(screens, experiments, errors);
  return { screens, experiments, errors };
}

/** Discovered once per document; the tree does not change at runtime. */
export const catalog: Catalog = buildCatalog();
