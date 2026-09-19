import { beforeEach, describe, expect, it } from 'vitest';

import { mutation, openHarness, seedItem, seedLocation, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
  seedItem(h, { id: 'crate', locationId: 'shelf', isContainer: true });
  seedItem(h, { id: 'cable', containerId: 'crate' });
  seedItem(h, { id: 'lamp', locationId: 'shelf' });
});

describe('item.changeType', () => {
  it('sets the type, validates fields, and records the containment capability', () => {
    const outcome = h.run(
      mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: { Fitting: 'E27' } })
    );
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('lamp')).toMatchObject({ typeKey: 'bulb', isContainer: 0, access: null });
    expect(JSON.parse(h.item('lamp').fields)).toEqual({ Fitting: 'E27' });
  });

  it('grants containment and a default open access for a containment type', () => {
    h.run(mutation('item.changeType', 'lamp', { typeKey: 'storage_box', fields: {} }));
    expect(h.item('lamp')).toMatchObject({ isContainer: 1, access: 'open' });
  });

  it('rejects an unknown type', () => {
    const outcome = h.run(
      mutation('item.changeType', 'lamp', { typeKey: 'no_such_type', fields: {} })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'type_unknown' });
  });

  it('rejects fields that do not fit the new type', () => {
    const outcome = h.run(
      mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: { Fitting: 'not-real' } })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('rejects dropping containment while the item still holds active contents', () => {
    const outcome = h.run(mutation('item.changeType', 'crate', { typeKey: 'bulb', fields: {} }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'has_contents' });
    expect(h.item('crate')).toMatchObject({ isContainer: 1 });
  });

  it('allows dropping containment once the container is empty', () => {
    h.run(mutation('item.setLifecycle', 'cable', { lifecycle: 'discarded', reason: 'used up' }));
    const outcome = h.run(mutation('item.changeType', 'crate', { typeKey: 'bulb', fields: {} }));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('crate')).toMatchObject({ isContainer: 0, access: null });
  });
});
