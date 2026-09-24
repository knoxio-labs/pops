import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_CONTAINMENT_DEPTH } from '../placement.js';
import {
  moveTo,
  mutation,
  openHarness,
  seedItem,
  seedLocation,
  type Harness,
} from './test-utils.js';

let h: Harness;

function into(itemId: string, containerId: string, verb = 'move', baseRevision = 1) {
  return mutation(
    'item.move',
    itemId,
    { to: { kind: 'container', itemId: containerId }, verb },
    { baseRevision }
  );
}

function pickUp(itemId: string, baseRevision = 1) {
  return mutation('item.move', itemId, { to: { kind: 'hand' }, verb: 'pick_up' }, { baseRevision });
}

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
  seedLocation(h, 'garage');
  seedLocation(h, 'gone', { deletedAt: '2026-09-01T00:00:00.000Z' });
  seedItem(h, { id: 'crate', locationId: 'shelf', isContainer: true });
  seedItem(h, { id: 'bin', containerId: 'crate', isContainer: true });
  seedItem(h, { id: 'cable', containerId: 'bin' });
  seedItem(h, { id: 'lamp', locationId: 'shelf' });
});

describe('item.move', () => {
  it('moves an item into a container and records the placement change', () => {
    expect(h.run(into('lamp', 'crate'))).toMatchObject({ status: 'applied', revision: 2 });

    expect(h.item('lamp')).toMatchObject({
      placementKind: 'container',
      containingItemId: 'crate',
      locationId: null,
    });
    const [event] = h.eventsFor('lamp');
    expect(event?.kind).toBe('moved');
    expect(JSON.parse(event?.before ?? '')).toEqual({
      placement: { kind: 'location', locationId: 'shelf' },
    });
    expect(JSON.parse(event?.after ?? '')).toEqual({
      placement: { kind: 'container', itemId: 'crate' },
    });
  });

  it('picks up into the hand remembering where the item was', () => {
    h.run(pickUp('lamp'));

    expect(h.item('lamp')).toMatchObject({
      placementKind: 'hand',
      locationId: null,
      previousPlacementKind: 'location',
      previousLocationId: 'shelf',
    });
    const [event] = h.eventsFor('lamp');
    expect(event?.kind).toBe('picked_up');
    expect(JSON.parse(event?.fields ?? '')).toEqual(['placement', 'previousPlacement']);
  });

  it('remembers a container as the previous placement too', () => {
    h.run(pickUp('cable'));
    expect(h.item('cable')).toMatchObject({
      previousPlacementKind: 'container',
      previousContainingItemId: 'bin',
    });
  });

  it('puts back into a closed container and forgets the previous placement', () => {
    h.run(pickUp('cable'));
    h.run(mutation('item.setAccess', 'bin', { access: 'closed' }));

    expect(h.run(into('cable', 'bin', 'put_back', 2))).toMatchObject({ status: 'applied' });

    expect(h.item('cable')).toMatchObject({
      placementKind: 'container',
      containingItemId: 'bin',
      previousPlacementKind: null,
      previousContainingItemId: null,
    });
    expect(h.eventsFor('cable').map((event) => event.kind)).toEqual(['picked_up', 'put_back']);
  });

  it('names the event after the verb', () => {
    h.run(pickUp('lamp'));
    const store = { to: { kind: 'location', locationId: 'garage' }, verb: 'store' };
    h.run(mutation('item.move', 'lamp', store, { baseRevision: 2 }));
    expect(h.eventsFor('lamp').map((event) => event.kind)).toEqual(['picked_up', 'stored']);
  });

  it('refuses pick_up to anywhere but the hand, and any other verb into the hand', () => {
    expect(
      h.run(mutation('item.move', 'lamp', { to: { kind: 'hand' }, verb: 'move' }))
    ).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(
      h.run(
        mutation('item.move', 'lamp', {
          to: { kind: 'location', locationId: 'garage' },
          verb: 'pick_up',
        })
      )
    ).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('refuses a place that does not exist or is tombstoned', () => {
    expect(h.run(moveTo('lamp', 'nowhere'))).toMatchObject({ reason: 'target_missing' });
    expect(h.run(moveTo('lamp', 'gone'))).toMatchObject({ reason: 'target_missing' });
    expect(h.item('lamp').locationId).toBe('shelf');
  });

  it('refuses a container target that is missing, and an item that is not a container', () => {
    expect(h.run(into('lamp', 'ghost'))).toMatchObject({ reason: 'target_missing' });
    expect(h.run(into('lamp', 'cable'))).toMatchObject({ reason: 'not_container' });
  });

  it('refuses storing into a container whose own quantity is greater than 1 (ADR-002 D3)', () => {
    seedItem(h, { id: 'drifted', locationId: 'garage', isContainer: true, quantity: 2 });
    expect(h.run(into('lamp', 'drifted'))).toMatchObject({
      status: 'rejected',
      reason: 'quantity_container_conflict',
    });
    expect(h.item('lamp').locationId).toBe('shelf');
  });

  it('refuses a move into itself or into anything it holds', () => {
    expect(h.run(into('crate', 'crate'))).toMatchObject({ status: 'rejected', reason: 'cycle' });
    expect(h.run(into('crate', 'bin'))).toMatchObject({ status: 'rejected', reason: 'cycle' });
    expect(h.item('crate').locationId).toBe('shelf');
  });

  it(`allows ${MAX_CONTAINMENT_DEPTH} containers above an item and refuses one more`, () => {
    seedItem(h, { id: 'c1', locationId: 'garage', isContainer: true });
    for (let level = 2; level <= MAX_CONTAINMENT_DEPTH + 1; level += 1) {
      seedItem(h, { id: `c${level}`, containerId: `c${level - 1}`, isContainer: true });
    }

    expect(h.run(into('lamp', `c${MAX_CONTAINMENT_DEPTH}`))).toMatchObject({ status: 'applied' });
    seedItem(h, { id: 'mug' });
    expect(h.run(into('mug', `c${MAX_CONTAINMENT_DEPTH + 1}`))).toMatchObject({
      status: 'rejected',
      reason: 'cycle',
    });
  });

  it('moves a container as one row: its contents keep their revisions and seq', () => {
    const before = { bin: h.item('bin'), cable: h.item('cable') };

    h.run(moveTo('crate', 'garage'));

    expect(h.item('crate')).toMatchObject({ locationId: 'garage', revision: 2 });
    expect(h.item('bin')).toEqual(before.bin);
    expect(h.item('cable')).toEqual(before.cable);
    expect(h.eventCount()).toBe(1);
  });

  it('does not conflict with packing into a box that moved meanwhile', () => {
    h.run(moveTo('crate', 'garage'));
    expect(h.run(into('lamp', 'crate'))).toMatchObject({ status: 'applied', converged: false });
  });

  it('keeps what an in-hand item remembered when it is picked up again elsewhere', () => {
    h.run(pickUp('lamp'));
    expect(h.run(pickUp('lamp', 2))).toMatchObject({ status: 'applied', revision: 2 });
    expect(h.item('lamp').previousLocationId).toBe('shelf');
  });
});
