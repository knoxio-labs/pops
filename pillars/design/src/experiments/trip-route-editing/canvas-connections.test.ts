import { describe, expect, it } from 'vitest';

import { missingTransportSlot } from './canvas-connections';
import { initialCanvas } from './canvas-model';

describe('transport gap slots', () => {
  it('uses one slot for an absent journey, without repeating existing unpurchased transport', () => {
    const state = initialCanvas('default');
    expect(missingTransportSlot(state, 'arrival')).toBe(true);
    expect(missingTransportSlot(state, 'family')).toBe(false);
    expect(missingTransportSlot(state, 'sydney-out')).toBe(false);
  });
  it('honours active rental coverage and leaves non-city or missing anchors without a slot', () => {
    const state = initialCanvas('default');
    expect(missingTransportSlot(state, 'curitiba')).toBe(false);
    expect(missingTransportSlot({ ...state, rentals: [] }, 'curitiba')).toBe(true);
    expect(missingTransportSlot(state, 'open-january')).toBe(false);
    expect(missingTransportSlot(state, 'flight')).toBe(false);
    expect(missingTransportSlot(state, 'missing')).toBe(false);
  });
});
