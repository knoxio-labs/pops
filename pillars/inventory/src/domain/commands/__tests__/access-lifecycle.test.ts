import { beforeEach, describe, expect, it } from 'vitest';

import { IPAD, mutation, openHarness, seedItem, seedLocation, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
  seedItem(h, { id: 'box', locationId: 'shelf', isContainer: true });
  seedItem(h, { id: 'lamp', locationId: 'shelf' });
});

describe('item.setAccess', () => {
  it('closes and reopens a container, naming each event', () => {
    h.run(mutation('item.setAccess', 'box', { access: 'closed' }));
    expect(h.item('box').access).toBe('closed');
    h.run(mutation('item.setAccess', 'box', { access: 'open' }, { baseRevision: 2 }));
    expect(h.item('box')).toMatchObject({ access: 'open', revision: 3 });
    expect(h.eventsFor('box').map((event) => event.kind)).toEqual(['closed', 'opened']);
  });

  it('refuses an item that is not a container', () => {
    expect(h.run(mutation('item.setAccess', 'lamp', { access: 'closed' }))).toMatchObject({
      status: 'rejected',
      reason: 'not_container',
    });
    expect(h.item('lamp').access).toBeNull();
  });

  it('refuses a state that is not open or closed', () => {
    expect(h.run(mutation('item.setAccess', 'box', { access: 'sealed' }))).toMatchObject({
      reason: 'invalid',
    });
  });

  it('conflicts when two devices set different access from the same base', () => {
    h.run(mutation('item.setAccess', 'box', { access: 'closed' }), IPAD);
    h.run(mutation('item.setAccess', 'box', { access: 'open' }, { baseRevision: 2 }), IPAD);
    expect(h.run(mutation('item.setAccess', 'box', { access: 'closed' }))).toMatchObject({
      status: 'conflict',
      field: 'access',
      mine: 'closed',
      theirs: 'open',
    });
  });
});

describe('item.setFull', () => {
  it('marks a container full as an edit', () => {
    h.run(mutation('item.setFull', 'box', { full: true }));
    expect(h.item('box').isFull).toBe(1);
    const [event] = h.eventsFor('box');
    expect(event?.kind).toBe('edited');
    expect(JSON.parse(event?.after ?? '')).toEqual({ isFull: true });
  });

  it('refuses an item that is not a container', () => {
    expect(h.run(mutation('item.setFull', 'lamp', { full: true }))).toMatchObject({
      reason: 'not_container',
    });
  });
});

describe('item.setLifecycle', () => {
  it('keeps the reason on the event, not the row, and stamps the change time', () => {
    const discard = mutation('item.setLifecycle', 'lamp', {
      lifecycle: 'discarded',
      reason: 'donated',
    });
    h.run(discard);

    const lamp = h.item('lamp');
    const [event] = h.eventsFor('lamp');
    expect(lamp.lifecycle).toBe('discarded');
    expect(lamp.lifecycleChangedAt).toBe(event?.serverTime);
    expect(lamp.placementKind).toBe('location');
    expect(event).toMatchObject({ kind: 'lifecycle_changed', reason: 'donated' });
  });

  it('restores a discarded item to active', () => {
    h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'lost' }));
    h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'active' }, { baseRevision: 2 }));
    expect(h.item('lamp').lifecycle).toBe('active');
  });

  it('refuses to restore a destroyed item', () => {
    h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'destroyed' }));

    for (const lifecycle of ['active', 'discarded']) {
      const outcome = h.run(
        mutation('item.setLifecycle', 'lamp', { lifecycle }, { baseRevision: 2 })
      );
      expect(outcome).toMatchObject({ status: 'rejected', reason: 'illegal_transition' });
    }
    expect(h.item('lamp')).toMatchObject({ lifecycle: 'destroyed', revision: 2 });
  });

  it('accepts destroying a destroyed item as a no-op', () => {
    h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'destroyed' }));
    const again = mutation(
      'item.setLifecycle',
      'lamp',
      { lifecycle: 'destroyed' },
      { baseRevision: 2 }
    );
    expect(h.run(again)).toMatchObject({ status: 'applied', revision: 2 });
    expect(h.eventsFor('lamp')).toHaveLength(1);
  });

  it('refuses a reason on a return to active, and an unknown lifecycle', () => {
    expect(
      h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'active', reason: 'found it' }))
    ).toMatchObject({ reason: 'invalid' });
    expect(h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'none_left' }))).toMatchObject({
      reason: 'invalid',
    });
  });
});

describe('item.restoreDeleted', () => {
  it('changes nothing on an item that is not deleted', () => {
    const outcome = h.run(mutation('item.restoreDeleted', 'lamp', {}, { baseRevision: null }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 1 });
    expect(h.eventCount()).toBe(0);
  });

  it('lifts a tombstone whatever base revision the client holds', () => {
    seedItem(h, { id: 'old', deletedAt: '2026-01-01T00:00:00.000Z' });
    const outcome = h.run(mutation('item.restoreDeleted', 'old', {}, { baseRevision: 1 }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 2 });
    expect(h.item('old').deletedAt).toBeNull();
    expect(h.eventsFor('old').map((event) => event.kind)).toEqual(['restored']);
  });

  it('re-attaches a sourceRef no live item holds now (POPS-4053)', () => {
    seedItem(h, {
      id: 'old',
      deletedAt: '2026-01-01T00:00:00.000Z',
      sourceRef: 'pops://purchases/order/p-1/item/i-1',
    });
    const outcome = h.run(mutation('item.restoreDeleted', 'old', {}, { baseRevision: 1 }));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('old').sourceRef).toBe('pops://purchases/order/p-1/item/i-1');
  });

  it('drops a sourceRef a live item has since claimed, rather than colliding (POPS-4053)', () => {
    seedItem(h, {
      id: 'old',
      deletedAt: '2026-01-01T00:00:00.000Z',
      sourceRef: 'pops://purchases/order/p-1/item/i-1',
    });
    seedItem(h, { id: 'new', sourceRef: 'pops://purchases/order/p-1/item/i-1' });

    const outcome = h.run(mutation('item.restoreDeleted', 'old', {}, { baseRevision: 1 }));

    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('old').deletedAt).toBeNull();
    expect(h.item('old').sourceRef).toBeNull();
    expect(h.item('new').sourceRef).toBe('pops://purchases/order/p-1/item/i-1');
    const restored = h.eventsFor('old').find((event) => event.kind === 'restored');
    expect(JSON.parse(restored?.after ?? '{}')).toMatchObject({ sourceRef: null });
  });
});
