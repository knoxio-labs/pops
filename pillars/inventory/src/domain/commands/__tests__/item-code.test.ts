import { beforeEach, describe, expect, it } from 'vitest';

import { suggestNextCode } from '../item-code.js';
import { mutation, openHarness, seedItem, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedItem(h, { id: 'lamp' });
  seedItem(h, { id: 'toaster' });
});

describe('item.setCode', () => {
  it('sets a code and records a code_set event', () => {
    const outcome = h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('lamp').code).toBe('B412');
    expect(h.eventsFor('lamp')[0]?.kind).toBe('code_set');
  });

  it('clears a code', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    h.run(mutation('item.setCode', 'lamp', { code: null }, { baseRevision: 2 }));
    expect(h.item('lamp').code).toBeNull();
  });

  it('is a conflict, case-insensitively, and never rewrites the stored code', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'b412' }));
    expect(outcome).toMatchObject({
      status: 'conflict',
      kind: 'code_collision',
      heldBy: { id: 'lamp', name: 'lamp' },
    });
    expect(h.item('toaster').code).toBeNull();
    expect(h.item('lamp').code).toBe('B412');
  });

  it('suggests the next free code keeping the stem', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'B412' }));
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: 'B413' });
  });

  it('skips a held candidate when suggesting the next free code', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    h.run(mutation('item.setCode', 'toaster', { code: 'B413' }, { baseRevision: 1 }));
    seedItem(h, { id: 'kettle' });
    const outcome = h.run(mutation('item.setCode', 'kettle', { code: 'B412' }));
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: 'B414' });
  });

  it('has no suggestion when the code has no trailing digits', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'LAMP' }));
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'LAMP' }));
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: null });
  });
});

describe('suggestNextCode', () => {
  it('returns null for a code with no trailing digits', () => {
    const h2 = openHarness();
    expect(suggestNextCode(h2.db, 'NOCODE', 'x')).toBeNull();
  });
});
