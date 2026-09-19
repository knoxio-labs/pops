import { beforeEach, describe, expect, it } from 'vitest';

import { mutation, openHarness, seedItem, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
});

describe('item.delete', () => {
  it('tombstones the row, keeping it (not a hard delete)', () => {
    seedItem(h, { id: 'lamp' });

    const outcome = h.run(mutation('item.delete', 'lamp', {}));

    expect(outcome).toMatchObject({ status: 'applied' });
    const row = h.item('lamp');
    expect(row.deletedAt).not.toBeNull();
    expect(row.name).toBe('lamp');
  });

  it('writes a deleted event', () => {
    seedItem(h, { id: 'lamp' });

    h.run(mutation('item.delete', 'lamp', {}));

    const event = h.eventsFor('lamp').find((e) => e.kind === 'deleted');
    expect(event).toBeDefined();
    expect(event?.entityRevision).toBe(2);
  });

  it('empties a deleted container: its contents go in hand remembering it', () => {
    seedItem(h, { id: 'crate', isContainer: true });
    seedItem(h, { id: 'cable', containerId: 'crate' });

    h.run(mutation('item.delete', 'crate', {}));

    const cable = h.item('cable');
    expect(cable.placementKind).toBe('hand');
    expect(cable.previousPlacementKind).toBe('container');
    expect(cable.previousContainingItemId).toBe('crate');
    expect(cable.revision).toBe(2);
  });

  it('records a picked_up event for each emptied item, distinct from the container deletion', () => {
    seedItem(h, { id: 'crate', isContainer: true });
    seedItem(h, { id: 'cable', containerId: 'crate' });

    h.run(mutation('item.delete', 'crate', {}));

    expect(h.eventsFor('cable').map((e) => e.kind)).toContain('picked_up');
    expect(h.eventsFor('crate').map((e) => e.kind)).toContain('deleted');
  });

  it('leaves an already-tombstoned container as-is (no double emptying)', () => {
    seedItem(h, { id: 'crate', isContainer: true, deletedAt: '2026-09-01T00:00:00.000Z' });
    seedItem(h, { id: 'cable', containerId: 'crate' });

    const outcome = h.run(mutation('item.delete', 'crate', {}));

    expect(outcome).toMatchObject({ status: 'conflict', kind: 'deleted' });
    expect(h.item('cable').placementKind).toBe('container');
  });

  it('rejects deleting an item that does not exist', () => {
    const outcome = h.run(mutation('item.delete', 'nope', {}));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'target_missing' });
  });

  it('drops the item from the search index', () => {
    seedItem(h, { id: 'lamp' });
    h.run(mutation('item.edit', 'lamp', { name: 'Lamp' }));

    h.run(mutation('item.delete', 'lamp', {}, { baseRevision: 2 }));

    const row = h.raw.prepare('select id from items_fts where id = ?').get('lamp');
    expect(row).toBeUndefined();
  });
});
