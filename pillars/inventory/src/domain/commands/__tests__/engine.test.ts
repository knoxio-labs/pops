import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { items, locations } from '../../../db/index.js';
import { CommandRejected } from '../errors.js';
import { defineOp } from '../op.js';
import { buildRegistry, COMMAND_REGISTRY } from '../registry.js';
import {
  IPAD,
  moveTo,
  mutation,
  openHarness,
  PHONE,
  seedItem,
  seedLocation,
  WEB,
  type Harness,
} from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
  seedLocation(h, 'garage');
  seedLocation(h, 'attic');
  seedItem(h, { id: 'box', locationId: 'shelf', isContainer: true });
  seedItem(h, { id: 'lamp', locationId: 'shelf' });
});

describe('idempotency', () => {
  it('replays a decided mutationId with its stored outcome and writes nothing', () => {
    const move = moveTo('lamp', 'garage');
    const first = h.run(move);
    const eventsAfterFirst = h.eventCount();
    const revisionAfterFirst = h.item('lamp').revision;

    const again = h.run(move);

    expect(again).toEqual(first);
    expect(h.eventCount()).toBe(eventsAfterFirst);
    expect(h.item('lamp').revision).toBe(revisionAfterFirst);
  });

  it('replays a stored conflict rather than re-judging it', () => {
    h.run(moveTo('lamp', 'garage'), IPAD);
    const stale = moveTo('lamp', 'attic');
    const first = h.run(stale);
    expect(first.status).toBe('conflict');

    expect(h.run(stale)).toEqual(first);
    expect(h.item('lamp').locationId).toBe('garage');
  });

  it('refuses a reused mutationId naming a different op or entity, keeping the stored one', () => {
    const move = moveTo('lamp', 'garage');
    h.run(move);

    const reused = h.run({
      ...move,
      op: 'item.setAccess',
      entityId: 'box',
      args: { access: 'closed' },
    });

    expect(reused).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(h.item('box').access).toBe('open');
    expect(h.storedMutation(move.mutationId)?.op).toBe('item.move');
  });

  it('stores refusals too, so a retry replays them', () => {
    const unknown = mutation('item.teleport', 'lamp', {});
    const first = h.run(unknown);
    expect(first).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(h.storedMutation(unknown.mutationId)?.status).toBe('rejected');
    expect(h.run(unknown)).toEqual(first);
  });
});

describe('dependencies', () => {
  it('defers a mutation whose dependency is unknown, stores nothing, and applies it once the dependency has', () => {
    const dependency = moveTo('box', 'garage');
    const dependent = moveTo('lamp', 'attic', { dependsOn: [dependency.mutationId] });

    expect(h.run(dependent)).toEqual({
      mutationId: dependent.mutationId,
      status: 'deferred',
      waitingOn: dependency.mutationId,
    });
    expect(h.storedMutation(dependent.mutationId)).toBeUndefined();
    expect(h.item('lamp').locationId).toBe('shelf');

    h.run(dependency);
    expect(h.run(dependent)).toMatchObject({ status: 'applied' });
    expect(h.item('lamp').locationId).toBe('attic');
  });

  it('defers a dependent of a mutation that conflicted', () => {
    h.run(moveTo('lamp', 'garage'), IPAD);
    const conflicted = moveTo('lamp', 'attic');
    expect(h.run(conflicted).status).toBe('conflict');

    const dependent = mutation(
      'item.setAccess',
      'box',
      { access: 'closed' },
      { dependsOn: [conflicted.mutationId] }
    );
    expect(h.run(dependent)).toMatchObject({
      status: 'deferred',
      waitingOn: conflicted.mutationId,
    });
    expect(h.item('box').access).toBe('open');
  });

  it('refuses a mutation that depends on itself', () => {
    const selfish = moveTo('lamp', 'garage');
    const outcome = h.run({ ...selfish, dependsOn: [selfish.mutationId] });
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });
});

describe('revision check', () => {
  it('refuses an update with no base revision, or one ahead of the row', () => {
    expect(h.run(moveTo('lamp', 'garage', { baseRevision: null }))).toMatchObject({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(h.run(moveTo('lamp', 'garage', { baseRevision: 2 }))).toMatchObject({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(h.item('lamp').revision).toBe(1);
  });

  it('applies a change whose fields are disjoint from the changes made since its base', () => {
    h.run(mutation('item.setAccess', 'box', { access: 'closed' }), IPAD);

    const outcome = h.run(moveTo('box', 'garage'));

    expect(outcome).toMatchObject({ status: 'applied', revision: 3, converged: false });
    const box = h.item('box');
    expect(box.locationId).toBe('garage');
    expect(box.access).toBe('closed');
  });

  it('converges when the stale change sets what the winning change already set', () => {
    h.run(moveTo('lamp', 'garage'), IPAD);
    const before = h.eventCount();

    const outcome = h.run(moveTo('lamp', 'garage'));

    expect(outcome).toMatchObject({ status: 'applied', revision: 2, converged: true });
    expect(h.eventCount()).toBe(before);
  });

  it('conflicts on placement when two devices moved the same item to different places', () => {
    const won = h.run(moveTo('lamp', 'garage'), IPAD);
    const stale = moveTo('lamp', 'attic');

    const outcome = h.run(stale);

    expect(outcome).toEqual({
      mutationId: stale.mutationId,
      status: 'conflict',
      kind: 'field',
      field: 'placement',
      mine: { kind: 'location', locationId: 'attic' },
      theirs: { kind: 'location', locationId: 'garage' },
      source: { kind: 'device', label: 'iPad' },
      at: expect.any(String),
      currentRevision: 2,
    });
    expect(won.status).toBe('applied');
    expect(h.item('lamp').locationId).toBe('garage');
    expect(h.item('lamp').revision).toBe(2);
  });

  it('names the server as the source when the winning change came from the web', () => {
    h.run(moveTo('lamp', 'garage'), WEB);
    expect(h.run(moveTo('lamp', 'attic'))).toMatchObject({
      status: 'conflict',
      source: { kind: 'web', label: 'Server' },
    });
  });

  it('names the latest of several changes to the field as the winner', () => {
    h.run(moveTo('lamp', 'garage'), WEB);
    h.run(moveTo('lamp', 'attic', { baseRevision: 2 }), IPAD);
    expect(h.run(moveTo('lamp', 'shelf'))).toMatchObject({
      status: 'conflict',
      theirs: { kind: 'location', locationId: 'attic' },
      source: { kind: 'device', label: 'iPad' },
      currentRevision: 3,
    });
  });
});

describe('recording', () => {
  it('stamps the row with the event it appended, and the event with the actor and mutation', () => {
    const move = moveTo('lamp', 'garage');
    const outcome = h.run(move);

    const [event] = h.eventsFor('lamp');
    const lamp = h.item('lamp');
    expect(outcome).toEqual({
      mutationId: move.mutationId,
      status: 'applied',
      revision: 2,
      seq: event?.seq,
      converged: false,
    });
    expect(lamp.seq).toBe(event?.seq);
    expect(lamp.updatedAt).toBe(event?.serverTime);
    expect(event).toMatchObject({
      entityKind: 'item',
      kind: 'moved',
      entityRevision: 2,
      actorKind: 'device',
      actorId: 'device-phone',
      actorLabel: 'Phone',
      mutationId: move.mutationId,
      clientTime: move.clientTime,
    });
    expect(JSON.parse(event?.fields ?? '')).toEqual(['placement']);
    expect(h.storedMutation(move.mutationId)?.actorId).toBe('device:device-phone');
  });

  it('answers a change that alters nothing with the current revision and writes no event', () => {
    const outcome = h.run(moveTo('lamp', 'shelf'));
    expect(outcome).toMatchObject({ status: 'applied', revision: 1, seq: 0, converged: false });
    expect(h.eventCount()).toBe(0);
  });

  it('refuses a mutation addressed to an item that does not exist', () => {
    expect(h.run(moveTo('ghost', 'shelf'))).toMatchObject({
      status: 'rejected',
      reason: 'target_missing',
    });
  });

  it('refuses malformed args without touching the row', () => {
    const outcome = h.run(mutation('item.move', 'lamp', { to: { kind: 'shelf' }, verb: 'move' }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(h.item('lamp').revision).toBe(1);
  });
});

const deleteOp = defineOp({
  op: 'test.delete',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: z.object({}),
  plan: (ctx) => ({ eventKind: 'deleted', changes: { deletedAt: ctx.now } }),
});

const failingOp = defineOp({
  op: 'test.failAfterWrite',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: z.object({ unexpected: z.boolean() }),
  plan: (_ctx, _target, args) => ({
    eventKind: 'moved',
    changes: { placement: { kind: 'hand' }, previousPlacement: null },
    effects: () => {
      if (args.unexpected) throw new Error('disk on fire');
      throw new CommandRejected('has_contents', 'refused after writing');
    },
  }),
});

const createLocationOp = defineOp({
  op: 'test.createLocation',
  mode: 'create',
  entity: 'location',
  args: z.object({ name: z.string() }),
  plan: (ctx, args) => ({
    eventKind: 'created',
    changes: { name: args.name, parentId: null },
    insert: (db, stamp) =>
      db
        .insert(locations)
        .values({
          id: ctx.mutation.entityId,
          name: args.name,
          lastEditedTime: stamp.now,
          revision: stamp.revision,
          seq: stamp.seq,
        })
        .run(),
  }),
});

const TEST_REGISTRY = buildRegistry([
  ...COMMAND_REGISTRY.values(),
  deleteOp,
  failingOp,
  createLocationOp,
]);

describe('atomicity', () => {
  it('rolls back the row and its event when the op refuses after writing, and stores the refusal', () => {
    const failing = mutation('test.failAfterWrite', 'lamp', { unexpected: false });

    const outcome = h.run(failing, PHONE, { registry: TEST_REGISTRY });

    expect(outcome).toMatchObject({ status: 'rejected', reason: 'has_contents' });
    expect(h.item('lamp')).toMatchObject({ placementKind: 'location', revision: 1, seq: 0 });
    expect(h.eventCount()).toBe(0);
    expect(h.storedMutation(failing.mutationId)?.status).toBe('rejected');
  });

  it('propagates an unexpected error with nothing written, not even an outcome', () => {
    const failing = mutation('test.failAfterWrite', 'lamp', { unexpected: true });

    expect(() => h.run(failing, PHONE, { registry: TEST_REGISTRY })).toThrow('disk on fire');
    expect(h.item('lamp').revision).toBe(1);
    expect(h.eventCount()).toBe(0);
    expect(h.storedMutation(failing.mutationId)).toBeUndefined();
  });
});

describe('tombstones', () => {
  it('answers a change to a deleted item with a deleted conflict naming who deleted it', () => {
    h.run(mutation('test.delete', 'lamp', {}), IPAD, { registry: TEST_REGISTRY });

    const outcome = h.run(moveTo('lamp', 'garage'));

    expect(outcome).toMatchObject({
      status: 'conflict',
      kind: 'deleted',
      source: { kind: 'device', label: 'iPad' },
    });
    expect(h.item('lamp').locationId).toBe('shelf');
  });

  it('attributes a tombstone with no deleting event to the server', () => {
    seedItem(h, { id: 'old', deletedAt: '2026-01-01T00:00:00.000Z' });
    expect(h.run(mutation('item.setLifecycle', 'old', { lifecycle: 'lost' }))).toMatchObject({
      status: 'conflict',
      kind: 'deleted',
      source: { kind: 'web', label: 'Server' },
      at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('lets restoreDeleted lift the tombstone, after which the original stale change applies', () => {
    h.run(mutation('test.delete', 'lamp', {}), IPAD, { registry: TEST_REGISTRY });

    const restore = mutation('item.restoreDeleted', 'lamp', {}, { baseRevision: null });
    expect(h.run(restore)).toMatchObject({ status: 'applied', revision: 3 });
    const original = moveTo('lamp', 'garage', { dependsOn: [restore.mutationId] });
    expect(h.run(original)).toMatchObject({ status: 'applied', revision: 4 });

    expect(h.item('lamp')).toMatchObject({ deletedAt: null, locationId: 'garage' });
    expect(h.eventsFor('lamp').map((event) => event.kind)).toEqual([
      'deleted',
      'restored',
      'moved',
    ]);
  });
});

describe('create ops', () => {
  it('appends the created event at revision 1 and stamps the new row with its seq', () => {
    const create = mutation(
      'test.createLocation',
      'loft',
      { name: 'Loft' },
      { baseRevision: null }
    );

    const outcome = h.run(create, PHONE, { registry: TEST_REGISTRY });

    const [event] = h.eventsFor('loft');
    expect(outcome).toMatchObject({ status: 'applied', revision: 1, seq: event?.seq });
    expect(event).toMatchObject({ kind: 'created', entityKind: 'location', before: '{}' });
    const row = h.db.select().from(locations).where(eq(locations.id, 'loft')).get();
    expect(row).toMatchObject({ revision: 1, seq: event?.seq });
  });

  it('refuses a create for an id that exists, or one carrying a base revision', () => {
    expect(
      h.run(
        mutation('test.createLocation', 'shelf', { name: 'Again' }, { baseRevision: null }),
        PHONE,
        {
          registry: TEST_REGISTRY,
        }
      )
    ).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(
      h.run(mutation('test.createLocation', 'loft', { name: 'Loft' }), PHONE, {
        registry: TEST_REGISTRY,
      })
    ).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(h.db.select().from(locations).where(eq(locations.id, 'loft')).get()).toBeUndefined();
  });
});

describe('registry', () => {
  it('refuses two ops under one name', () => {
    expect(() => buildRegistry([deleteOp, deleteOp])).toThrow('registered twice');
  });

  it('holds exactly the ops this pillar defines so far', () => {
    expect([...COMMAND_REGISTRY.keys()].toSorted()).toEqual([
      'event.revert',
      'item.move',
      'item.restoreDeleted',
      'item.setAccess',
      'item.setFull',
      'item.setLifecycle',
    ]);
  });
});

describe('the untouched rows', () => {
  it('leaves every other item alone', () => {
    h.run(moveTo('lamp', 'garage'));
    const box = h.db.select().from(items).where(eq(items.id, 'box')).get();
    expect(box).toMatchObject({ revision: 1, seq: 0 });
  });
});
