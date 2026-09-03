import { describe, expect, it } from 'vitest';

import {
  buildAddress,
  parseAddress,
  pathOf,
  preserveCoordinates,
  screenIdOf,
  type Address,
} from './address';

const cases: Address[] = [
  { path: ['finance', 'import-review'] },
  { path: ['finance', 'accounts', 'pickers', 'entity'] },
  { path: ['finance', 'import-review'], state: 'empty' },
  { experimentId: 'density', variantId: 'table', path: ['finance', 'import-review'] },
  {
    experimentId: 'density',
    variantId: 'table',
    path: ['finance', 'import'],
    stepId: 'upload',
  },
  {
    experimentId: 'density',
    variantId: 'table',
    path: ['finance', 'accounts', 'import'],
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
    expect(buildAddress({ path: ['finance', 'import-review'] })).toBe('/s/finance/import-review');
    expect(buildAddress({ path: ['finance', 'accounts', 'form'] })).toBe(
      '/s/finance/accounts/form'
    );
    expect(
      buildAddress({
        experimentId: 'density',
        variantId: 'table',
        path: ['finance', 'import'],
        stepId: 'upload',
        state: 'error',
      })
    ).toBe('/x/density/table/s/finance/import?step=upload&state=error');
  });

  it('reads a deep path as the screen rather than as a flow step', () => {
    expect(parseAddress('/s/finance/accounts/form')?.path).toEqual(['finance', 'accounts', 'form']);
    expect(parseAddress('/s/finance/accounts/form')?.stepId).toBeUndefined();
    expect(parseAddress('/s/finance/import', '?step=upload')?.stepId).toBe('upload');
  });

  it('carries an anchor in the fragment', () => {
    const address: Address = { path: ['a', 'b'], anchor: 'submit' };
    expect(buildAddress(address)).toBe('/s/a/b#submit');
    expect(parseAddress('/s/a/b', '', '#submit')).toEqual(address);
  });

  it('returns null for a non-address path', () => {
    expect(parseAddress('/')).toBeNull();
    expect(parseAddress('/tokens')).toBeNull();
    expect(parseAddress('/s/only-one-segment')).toBeNull();
    expect(parseAddress('/s/a//b')).toBeNull();
    expect(parseAddress('/frame/s/a/b')).toBeNull();
  });

  it('derives the screen id from the address, and back', () => {
    expect(screenIdOf({ path: ['finance', 'accounts', 'form'] })).toBe('finance/accounts/form');
    expect(pathOf('finance/accounts/form')).toEqual(['finance', 'accounts', 'form']);
  });
});

const at = (over: Partial<Address>): Address => ({ path: ['a', 'b'], ...over });

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
