import { describe, expect, it } from 'vitest';

import {
  buildAddress,
  parseAddress,
  preserveCoordinates,
  screenIdOf,
  type Address,
} from './address';

const cases: Address[] = [
  { area: 'finance', slug: 'import-review' },
  { area: 'finance', slug: 'import-review', state: 'empty' },
  { experimentId: 'density', variantId: 'table', area: 'finance', slug: 'import-review' },
  {
    experimentId: 'density',
    variantId: 'table',
    area: 'finance',
    slug: 'import',
    stepId: 'upload',
  },
  {
    experimentId: 'density',
    variantId: 'table',
    area: 'finance',
    slug: 'import',
    stepId: 'upload',
    state: 'error',
  },
];

describe('buildAddress / parseAddress', () => {
  it.each(cases)('round-trips %o', (address) => {
    const url = buildAddress(address);
    const [pathname, search] = url.split('?');
    expect(parseAddress(pathname ?? '', search ? `?${search}` : '')).toEqual(address);
  });

  it('builds the documented shapes', () => {
    expect(buildAddress({ area: 'finance', slug: 'import-review' })).toBe(
      '/s/finance/import-review'
    );
    expect(
      buildAddress({
        experimentId: 'density',
        variantId: 'table',
        area: 'finance',
        slug: 'import',
        stepId: 'upload',
        state: 'error',
      })
    ).toBe('/x/density/table/s/finance/import/upload?state=error');
  });

  it('carries an anchor in the fragment', () => {
    const address: Address = { area: 'a', slug: 'b', anchor: 'submit' };
    expect(buildAddress(address)).toBe('/s/a/b#submit');
    expect(parseAddress('/s/a/b', '', '#submit')).toEqual(address);
  });

  it('returns null for a non-address path', () => {
    expect(parseAddress('/')).toBeNull();
    expect(parseAddress('/tokens')).toBeNull();
    expect(parseAddress('/s/only-one-segment')).toBeNull();
    expect(parseAddress('/frame/s/a/b')).toBeNull();
  });

  it('derives the screen id from the address', () => {
    expect(screenIdOf({ area: 'finance', slug: 'import-review' })).toBe('finance/import-review');
  });
});

const at = (over: Partial<Address>): Address => ({ area: 'a', slug: 'b', ...over });

describe('preserveCoordinates', () => {
  it('drops the step when the target is a leaf', () => {
    const result = preserveCoordinates(at({ stepId: 'upload' }), {
      steps: [],
      statesFor: () => [],
    });
    expect(result.stepId).toBeUndefined();
  });

  it('keeps a step the target flow has, else falls back to the first', () => {
    const caps = { steps: ['upload', 'review'], statesFor: () => [] };
    expect(preserveCoordinates(at({ stepId: 'review' }), caps).stepId).toBe('review');
    expect(preserveCoordinates(at({ stepId: 'nope' }), caps).stepId).toBe('upload');
  });

  it('keeps a state the target surface has, else drops it', () => {
    expect(
      preserveCoordinates(at({ state: 'empty' }), { steps: [], statesFor: () => ['empty'] }).state
    ).toBe('empty');
    expect(
      preserveCoordinates(at({ state: 'empty' }), { steps: [], statesFor: () => ['error'] }).state
    ).toBeUndefined();
  });
});
