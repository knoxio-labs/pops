import { beforeEach, describe, expect, it } from 'vitest';

import { COMMAND_REGISTRY } from '../registry.js';
import {
  IPAD,
  moveTo,
  mutation,
  openHarness,
  seedItem,
  seedLocation,
  type Harness,
} from './test-utils.js';

let h: Harness;

function revert(entityId: string, seq: number) {
  return mutation('event.revert', entityId, { seq }, { baseRevision: null });
}

function lastSeq(id: string): number {
  const seq = h.eventsFor(id).at(-1)?.seq;
  if (seq === undefined) throw new Error(`no events for ${id}`);
  return seq;
}

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
  seedLocation(h, 'garage');
  seedLocation(h, 'attic');
  seedItem(h, { id: 'box', locationId: 'shelf', isContainer: true });
  seedItem(h, { id: 'lamp', locationId: 'shelf' });
});

describe('event.revert', () => {
  it('writes back the before values as a reverted event that names the original', () => {
    h.run(moveTo('lamp', 'garage'));
    const moved = lastSeq('lamp');

    expect(h.run(revert('lamp', moved))).toMatchObject({ status: 'applied', revision: 3 });

    expect(h.item('lamp')).toMatchObject({ placementKind: 'location', locationId: 'shelf' });
    const reverted = h.eventsFor('lamp').at(-1);
    expect(reverted).toMatchObject({ kind: 'reverted', compensatesSeq: moved });
  });

  it('undoes a pick-up, putting back both the placement and the forgotten previous one', () => {
    h.run(mutation('item.move', 'lamp', { to: { kind: 'hand' }, verb: 'pick_up' }));
    h.run(revert('lamp', lastSeq('lamp')));
    expect(h.item('lamp')).toMatchObject({
      placementKind: 'location',
      locationId: 'shelf',
      previousPlacementKind: null,
    });
  });

  it('undoes a lifecycle change', () => {
    h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'discarded', reason: 'sold' }));
    h.run(revert('lamp', lastSeq('lamp')));
    expect(h.item('lamp').lifecycle).toBe('active');
  });

  it('refreshes the search index after reverting a persisted type and its fields', () => {
    h.run(mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: { Fitting: 'E27' } }));
    const changed = lastSeq('lamp');
    expect(
      h.raw
        .prepare(
          'select type_label as typeLabel, field_text as fieldText from items_fts where id = ?'
        )
        .get('lamp')
    ).toEqual({ typeLabel: 'Light bulb', fieldText: 'E27' });

    expect(h.run(revert('lamp', changed))).toMatchObject({ status: 'applied' });

    expect(
      h.raw
        .prepare(
          'select type_label as typeLabel, field_text as fieldText from items_fts where id = ?'
        )
        .get('lamp')
    ).toEqual({ typeLabel: '', fieldText: '' });
  });

  it('conflicts when a field of the reverted event changed since, and writes nothing', () => {
    h.run(moveTo('lamp', 'garage'));
    const superseded = lastSeq('lamp');
    h.run(moveTo('lamp', 'attic', { baseRevision: 2 }), IPAD);

    const outcome = h.run(revert('lamp', superseded));

    expect(outcome).toMatchObject({
      status: 'conflict',
      kind: 'field',
      field: 'placement',
      mine: { kind: 'location', locationId: 'shelf' },
      theirs: { kind: 'location', locationId: 'attic' },
      source: { kind: 'device', label: 'iPad' },
      currentRevision: 3,
    });
    expect(h.item('lamp')).toMatchObject({ locationId: 'attic', revision: 3 });
  });

  it('is not blocked by later changes to other fields', () => {
    h.run(mutation('item.setAccess', 'box', { access: 'closed' }));
    const closed = lastSeq('box');
    h.run(moveTo('box', 'garage', { baseRevision: 2 }));

    expect(h.run(revert('box', closed))).toMatchObject({ status: 'applied' });
    expect(h.item('box')).toMatchObject({ access: 'open', locationId: 'garage' });
  });

  it('refuses to undo a destruction', () => {
    h.run(mutation('item.setLifecycle', 'lamp', { lifecycle: 'destroyed' }));
    expect(h.run(revert('lamp', lastSeq('lamp')))).toMatchObject({
      status: 'rejected',
      reason: 'illegal_transition',
    });
  });

  it('refuses to undo a creation', () => {
    h.raw
      .prepare(
        `INSERT INTO events (entity_kind, entity_id, kind, fields, before, after, entity_revision, actor_kind, server_time)
         VALUES ('item', 'lamp', 'created', '["placement"]', '{}', '{"placement":{"kind":"location","locationId":"shelf"}}', 1, 'migration', 'then')`
      )
      .run();
    expect(h.run(revert('lamp', lastSeq('lamp')))).toMatchObject({
      reason: 'illegal_transition',
    });
  });

  it('refuses an event about another entity, and one that does not exist', () => {
    h.run(moveTo('lamp', 'garage'));
    expect(h.run(revert('box', lastSeq('lamp')))).toMatchObject({ reason: 'invalid' });
    expect(h.run(revert('lamp', 9999))).toMatchObject({ reason: 'target_missing' });
  });

  it('refuses to restore a placement whose place has been tombstoned since', () => {
    h.run(moveTo('lamp', 'garage'));
    const moved = lastSeq('lamp');
    h.raw.prepare(`UPDATE locations SET deleted_at = 'now' WHERE id = 'shelf'`).run();

    expect(h.run(revert('lamp', moved))).toMatchObject({ reason: 'target_missing' });
    expect(h.item('lamp').locationId).toBe('garage');
  });

  it('refuses a location event whose restored parent would put the place inside itself', () => {
    seedLocation(h, 'room');
    seedLocation(h, 'cupboard', { parentId: 'room' });
    h.raw
      .prepare(
        `INSERT INTO events (entity_kind, entity_id, kind, fields, before, after, entity_revision, actor_kind, server_time)
         VALUES ('location', 'room', 'moved', '["parentId"]', '{"parentId":"cupboard"}', '{"parentId":null}', 2, 'web', 'then')`
      )
      .run();
    h.raw.prepare(`UPDATE locations SET revision = 2 WHERE id = 'room'`).run();

    expect(h.run(revert('room', lastSeq('room')))).toMatchObject({ reason: 'cycle' });
  });

  it('is registered to judge staleness itself, so it needs no base revision', () => {
    expect(COMMAND_REGISTRY.get('event.revert')?.bind({ seq: 1 })).toMatchObject({
      mode: 'update',
      revisionCheck: 'op',
    });
  });
});
