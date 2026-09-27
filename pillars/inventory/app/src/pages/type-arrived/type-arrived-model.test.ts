import { describe, expect, it } from 'vitest';

import {
  appliedMessage,
  applyLabel,
  describeArrival,
  labelsText,
  tickReducer,
} from './type-arrived-model.js';

import type { ArrivedType } from './type-arrived-model.js';

const type: ArrivedType = {
  id: 'type-garden',
  key: 'garden',
  name: 'Garden tools',
  revision: 8,
  legacyLabels: ['garden', 'Garden tools'],
};

describe('tickReducer', () => {
  it('toggles one id without touching the others', () => {
    const state = new Set(['one', 'two']);
    expect(tickReducer(state, { type: 'toggle', id: 'one' })).toEqual(new Set(['two']));
    expect(tickReducer(state, { type: 'toggle', id: 'three' })).toEqual(
      new Set(['one', 'two', 'three'])
    );
  });

  it('does not mutate the previous set', () => {
    const state = new Set(['one']);
    tickReducer(state, { type: 'toggle', id: 'one' });
    expect(state).toEqual(new Set(['one']));
  });

  it('ticks all or none', () => {
    const state = new Set(['one']);
    expect(tickReducer(state, { type: 'none' })).toEqual(new Set());
    expect(tickReducer(new Set(), { type: 'all', ids: ['two', 'three'] })).toEqual(
      new Set(['two', 'three'])
    );
  });
});

describe('type-arrived copy', () => {
  it('says how many Apply will type', () => {
    expect(applyLabel(0)).toBe('Apply');
    expect(applyLabel(4)).toBe('Apply to 4');
  });

  it('says what was typed, singular and plural', () => {
    expect(appliedMessage(1, 'Garden tools')).toBe('Typed 1 item as Garden tools');
    expect(appliedMessage(5, 'Garden tools')).toBe('Typed 5 items as Garden tools');
  });

  it('quotes every legacy label joined with or', () => {
    expect(labelsText(type)).toBe('“garden” or “Garden tools”');
  });

  it('describes review, applied with and without leftovers, and nothing matched', () => {
    expect(describeArrival('review', type, 5, 5)).toBe(
      'Revision 8 published Garden tools. 5 untyped items were filed as “garden” or “Garden tools”. Untick any that are not Garden tools.'
    );
    expect(describeArrival('applied', type, 5, 5)).toBe(
      'Revision 8 published Garden tools. 5 items are now Garden tools.'
    );
    expect(describeArrival('applied', type, 1, 1)).toBe(
      'Revision 8 published Garden tools. 1 item is now Garden tools.'
    );
    expect(describeArrival('applied', type, 5, 4)).toBe(
      'Revision 8 published Garden tools. 4 items are now Garden tools. 1 left untyped.'
    );
    expect(describeArrival('review', type, 0, 0)).toBe(
      'Revision 8 published Garden tools. It claims items filed as “garden” or “Garden tools”.'
    );
  });
});
