import { beforeEach, describe, expect, it } from 'vitest';

import { mergeFieldsPatch } from '../item-edit.js';
import { mutation, openHarness, seedItem, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedItem(h, { id: 'lamp' });
});

describe('mergeFieldsPatch', () => {
  it('sets a key and leaves the rest untouched', () => {
    expect(mergeFieldsPatch({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('deletes a key whose patch value is null', () => {
    expect(mergeFieldsPatch({ a: 1, b: 2 }, { a: null })).toEqual({ b: 2 });
  });
});

describe('item.edit', () => {
  it('changes the name and records an edited event', () => {
    const outcome = h.run(mutation('item.edit', 'lamp', { name: 'Reading lamp' }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 2 });
    expect(h.item('lamp').name).toBe('Reading lamp');
    expect(h.eventsFor('lamp')[0]?.kind).toBe('edited');
  });

  it('clears the note with an explicit null', () => {
    h.run(mutation('item.edit', 'lamp', { note: 'fragile' }));
    h.run(mutation('item.edit', 'lamp', { note: null }, { baseRevision: 2 }));
    expect(h.item('lamp').note).toBeNull();
  });

  it('patches one field of the fields blob without disturbing the others, validated against the type', () => {
    h.run(mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: {} }));
    const withFields = h.run(
      mutation('item.edit', 'lamp', { fields: { Fitting: 'E27' } }, { baseRevision: 2 })
    );
    expect(withFields).toMatchObject({ status: 'applied' });
    h.run(
      mutation(
        'item.edit',
        'lamp',
        { fields: { Fitting: 'not-a-real-fitting' } },
        { baseRevision: 3 }
      )
    );
    expect(JSON.parse(h.item('lamp').fields)).toEqual({ Fitting: 'E27' });
  });

  it('rejects a fields patch that does not fit the type', () => {
    h.run(mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: {} }));
    const outcome = h.run(
      mutation(
        'item.edit',
        'lamp',
        { fields: { Fitting: 'not-a-real-fitting' } },
        { baseRevision: 2 }
      )
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('rejects fields on an untyped item', () => {
    const outcome = h.run(mutation('item.edit', 'lamp', { fields: { made_up: 'x' } }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('writes no event when nothing changes', () => {
    h.run(mutation('item.edit', 'lamp', { name: 'lamp' }));
    expect(h.eventCount()).toBe(0);
  });
});
