import { describe, expect, it } from 'vitest';

import { makeCatalog, makeScreen } from '../test/factories';
import { capabilitiesFor, resolveSurface } from './surface';

import type { Catalog } from '../registry';

function flowScreen(): ReturnType<typeof makeScreen> {
  return makeScreen({
    id: 'finance/import',
    title: 'Import',
    steps: [
      makeScreen({ id: 'finance/account' }),
      makeScreen({ id: 'finance/upload' }),
      makeScreen({ id: 'finance/review' }),
    ],
  });
}

function catalogOf(screens: ReturnType<typeof makeScreen>[]): Catalog {
  return makeCatalog({ screens });
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
