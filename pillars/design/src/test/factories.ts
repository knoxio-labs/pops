import { createElement } from 'react';

import type { Catalog, ExperimentEntry, ScreenEntry, VariantEntry } from '../registry';

/**
 * Real (not cast) fixtures for the registry and shell unit tests, so the
 * suites stay aligned with the types they exercise.
 */
export function makeScreen(overrides: Partial<ScreenEntry> & { id: string }): ScreenEntry {
  const [area = '', slug = ''] = overrides.id.split('/');
  return {
    area,
    slug,
    title: slug,
    order: 0,
    component: () => createElement('div'),
    experiments: [],
    ...overrides,
  };
}

export function makeVariant(overrides: Partial<VariantEntry> & { id: string }): VariantEntry {
  return { name: overrides.id, screens: [], ...overrides };
}

export function makeExperiment(
  overrides: Partial<ExperimentEntry> & { id: string; screen: string }
): ExperimentEntry {
  return { name: overrides.id, status: 'active', variants: [], ...overrides };
}

export function makeCatalog(overrides: Partial<Catalog> = {}): Catalog {
  return { screens: [], experiments: [], errors: [], ...overrides };
}
