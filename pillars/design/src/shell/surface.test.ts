import { describe, expect, it } from 'vitest';

import { capabilitiesFor, resolveSurface } from './surface';

import type { Catalog, ScreenEntry } from '../registry';

function step(area: string, flow: string, slug: string): ScreenEntry {
  return { id: `${area}/${slug}`, area, slug, title: slug, order: 0, experiments: [] };
}

function flowScreen(): ScreenEntry {
  return {
    id: 'finance/import',
    area: 'finance',
    slug: 'import',
    title: 'Import',
    order: 0,
    steps: [
      step('finance', 'import', 'account'),
      step('finance', 'import', 'upload'),
      step('finance', 'import', 'review'),
    ],
    experiments: [],
  };
}

function catalogOf(screens: ScreenEntry[]): Catalog {
  return { screens, experiments: [], errors: [] };
}

describe('resolveSurface', () => {
  it('matches a step by its slug — the single segment the URL carries', () => {
    const catalog = catalogOf([flowScreen()]);
    const { screen, step: found } = resolveSurface(catalog, {
      screenId: 'finance/import',
      stepId: 'upload',
    });
    expect(screen?.id).toBe('finance/import');
    expect(found?.slug).toBe('upload');
  });

  it('does not fall back to the first step for a step id that names none', () => {
    const catalog = catalogOf([flowScreen()]);
    const { screen, step: found } = resolveSurface(catalog, {
      screenId: 'finance/import',
      stepId: 'does-not-exist',
    });
    expect(screen?.id).toBe('finance/import');
    expect(found).toBeUndefined();
  });

  it('defaults to the first step only when no step is named at all', () => {
    const catalog = catalogOf([flowScreen()]);
    const { step: found } = resolveSurface(catalog, { screenId: 'finance/import' });
    expect(found?.slug).toBe('account');
  });
});

describe('capabilitiesFor', () => {
  it('reports step slugs, matching what the address grammar carries', () => {
    const catalog = catalogOf([flowScreen()]);
    const caps = capabilitiesFor(catalog, {}, 'finance/import');
    expect(caps.steps).toEqual(['account', 'upload', 'review']);
  });
});
