/**
 * The sync protocol end to end through the real app: snapshot paging pinned to
 * a high-water seq, the change feed catching up from it, the epoch and
 * protocol guards, cursors, and batched idempotent mutations.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, syncMeta } from '../../db/index.js';
import {
  createItem,
  createLocation,
  openSyncHarness,
  PROTOCOL,
  send,
  wireMutation,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let h: SyncHarness;

beforeEach(() => {
  h = openSyncHarness(transport);
});
afterEach(() => h.close());

interface Row {
  id: string;
  revision: number;
  seq: number;
  name: string;
  deletedAt: string | null;
}
interface SnapshotBody {
  epoch: string;
  highWaterSeq: number;
  total: number;
  items: Row[];
  locations: Row[];
  nextCursor: string | null;
}
interface ChangesBody {
  epoch: string;
  items: Row[];
  locations: Row[];
  events: { seq: number; entityId: string; kind: string }[];
  nextSince: number;
  hasMore: boolean;
}

async function snapshot(cursor?: string, limit = 2): Promise<SnapshotBody> {
  const query: Record<string, string | number> = { limit };
  if (cursor !== undefined) query['cursor'] = cursor;
  const response = await h.api.get('/sync/snapshot').set(PROTOCOL).query(query);
  expect(response.status).toBe(200);
  return response.body as SnapshotBody;
}

async function changes(since: number, epoch: string, limit = 500): Promise<ChangesBody> {
  const response = await h.api.get('/sync/changes').set(PROTOCOL).query({ since, epoch, limit });
  expect(response.status).toBe(200);
  return response.body as ChangesBody;
}

async function applyAll(...mutations: ReturnType<typeof wireMutation>[]): Promise<void> {
  const response = await send(h.api, mutations);
  expect(response.status).toBe(200);
  const statuses = (response.body as { outcomes: { status: string }[] }).outcomes.map(
    (outcome) => outcome.status
  );
  expect(statuses.every((status) => status === 'applied')).toBe(true);
}

/** Replay snapshot rows, then feed rows, keeping the highest revision per id. */
function converge(rows: Row[]): Map<string, Row> {
  const byId = new Map<string, Row>();
  for (const row of rows) {
    const known = byId.get(row.id);
    if (!known || row.revision > known.revision) byId.set(row.id, row);
  }
  return byId;
}

describe('snapshot then feed', () => {
  it('pins the high-water seq across pages, and the feed from it converges on the live state', async () => {
    const [garage, shed] = [randomUUID(), randomUUID()];
    const [drill, saw, tape] = [randomUUID(), randomUUID(), randomUUID()];
    await applyAll(
      createLocation(garage, 'Garage'),
      createLocation(shed, 'Shed'),
      createItem(drill, 'Drill', { kind: 'location', locationId: garage }),
      createItem(saw, 'Saw', { kind: 'location', locationId: garage })
    );

    const first = await snapshot();
    expect(first.total).toBe(4);
    expect(first.locations.map((row) => row.name).toSorted()).toEqual(['Garage', 'Shed']);
    expect(first.items).toEqual([]);
    expect(first.nextCursor).not.toBeNull();

    await applyAll(
      createItem(tape, 'Tape'),
      wireMutation('item.edit', drill, { name: 'Cordless drill' }, { baseRevision: 1 }),
      wireMutation('location.rename', shed, { name: 'Old shed' }, { baseRevision: 1 })
    );

    const pages = [first];
    let cursor = first.nextCursor;
    while (cursor !== null) {
      const page = await snapshot(cursor);
      pages.push(page);
      cursor = page.nextCursor;
    }
    expect(pages.every((page) => page.highWaterSeq === first.highWaterSeq)).toBe(true);
    expect(pages.every((page) => page.epoch === first.epoch)).toBe(true);

    const feed = await changes(first.highWaterSeq, first.epoch);
    expect(feed.hasMore).toBe(false);
    expect(feed.events.map((event) => event.kind)).toEqual(['created', 'edited', 'edited']);

    const items = converge([...pages.flatMap((page) => page.items), ...feed.items]);
    const places = converge([...pages.flatMap((page) => page.locations), ...feed.locations]);
    expect([...items.values()].map((row) => row.name).toSorted()).toEqual([
      'Cordless drill',
      'Saw',
      'Tape',
    ]);
    expect(places.get(shed)?.name).toBe('Old shed');
  });

  it('serves live rows only; a tombstone reaches the client through the feed', async () => {
    const [garage, attic] = [randomUUID(), randomUUID()];
    await applyAll(createLocation(garage, 'Garage'), createLocation(attic, 'Attic'));
    const before = await snapshot(undefined, 10);

    await applyAll(wireMutation('location.delete', attic, {}, { baseRevision: 1 }));
    const after = await snapshot(undefined, 10);
    expect(after.locations.map((row) => row.id)).toEqual([garage]);

    const feed = await changes(before.highWaterSeq, before.epoch);
    expect(feed.locations).toHaveLength(1);
    expect(feed.locations[0]).toMatchObject({ id: attic, deletedAt: expect.any(String) });
  });

  it('ends on the page that serves the last row, with no empty trailing page', async () => {
    await applyAll(createLocation(randomUUID(), 'A'), createItem(randomUUID(), 'B'));
    const only = await snapshot(undefined, 2);
    expect(only.locations).toHaveLength(1);
    expect(only.items).toHaveLength(1);
    expect(only.nextCursor).toBeNull();
  });
});

describe('the change feed', () => {
  it('pages by event count, carries each row once at its latest change, and reports hasMore', async () => {
    const box = randomUUID();
    await applyAll(createItem(box, 'Box'));
    const start = await snapshot();
    await applyAll(
      wireMutation('item.edit', box, { name: 'Box 2' }, { baseRevision: 1 }),
      wireMutation('item.edit', box, { name: 'Box 3' }, { baseRevision: 2 })
    );

    const first = await changes(start.highWaterSeq, start.epoch, 1);
    expect(first.events).toHaveLength(1);
    expect(first.items).toEqual([]);
    expect(first.hasMore).toBe(true);

    const second = await changes(first.nextSince, start.epoch, 1);
    expect(second.items.map((row) => row.name)).toEqual(['Box 3']);
    expect(second.hasMore).toBe(false);

    const idle = await changes(second.nextSince, start.epoch);
    expect(idle).toMatchObject({
      events: [],
      items: [],
      nextSince: second.nextSince,
      hasMore: false,
    });
  });

  it('409s a since beyond the latest seq, as after a restore from an older backup', async () => {
    const { epoch, highWaterSeq } = await snapshot();
    const response = await h.api
      .get('/sync/changes')
      .set(PROTOCOL)
      .query({ since: highWaterSeq + 1, epoch });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'resync_required' });
  });

  it('409s an epoch the server does not hold', async () => {
    const response = await h.api
      .get('/sync/changes')
      .set(PROTOCOL)
      .query({ since: 0, epoch: 'not-this-epoch' });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'resync_required' });
  });

  it('409s a snapshot cursor issued before the epoch rotated', async () => {
    await applyAll(createLocation(randomUUID(), 'A'), createLocation(randomUUID(), 'B'));
    const first = await snapshot(undefined, 1);
    h.db.db.update(syncMeta).set({ value: 'rotated' }).where(eq(syncMeta.key, 'epoch')).run();

    const response = await h.api
      .get('/sync/snapshot')
      .set(PROTOCOL)
      .query({ cursor: first.nextCursor ?? '' });
    expect(response.status).toBe(409);
  });
});

describe('cursors', () => {
  it.each([
    ['not base64url', '!!!'],
    ['base64url but not JSON', Buffer.from('nope').toString('base64url')],
    ['JSON of another shape', Buffer.from('{"v":1,"t":"history"}').toString('base64url')],
  ])('400s a foreign snapshot cursor: %s', async (_label, cursor) => {
    const response = await h.api.get('/sync/snapshot').set(PROTOCOL).query({ cursor });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'invalid_cursor' });
  });
});

describe('the protocol header', () => {
  it('426s a request without it', async () => {
    const response = await h.api.get('/sync/snapshot');
    expect(response.status).toBe(426);
    expect(response.body).toMatchObject({ code: 'client_too_old' });
  });

  it('426s a protocol below the server minimum, on every sync sub-router', async () => {
    h.db.db.update(syncMeta).set({ value: '3' }).where(eq(syncMeta.key, 'min_protocol')).run();
    const old = { 'Pops-Inventory-Protocol': '2' };
    const responses = await Promise.all([
      h.api.get('/sync/snapshot').set(old),
      h.api.get('/types').set(old),
      h.api.post('/codes/suggest').set(old).send({ name: 'Box' }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([426, 426, 426]);
  });

  it('serves the minimum itself and anything newer', async () => {
    h.db.db.update(syncMeta).set({ value: '3' }).where(eq(syncMeta.key, 'min_protocol')).run();
    for (const version of ['3', '4']) {
      const response = await h.api.get('/types').set({ 'Pops-Inventory-Protocol': version });
      expect(response.status).toBe(200);
    }
  });

  it('400s a value that is not a number', async () => {
    const response = await h.api.get('/types').set({ 'Pops-Inventory-Protocol': 'v1' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'invalid_protocol' });
  });

  it('leaves routes outside the protocol alone', async () => {
    const response = await h.api.get('/items');
    expect(response.status).toBe(200);
  });
});

describe('POST /sync/mutations', () => {
  it('applies a batch of 50 in order, returning a conflict mid-batch and committing the rest', async () => {
    const shelf = randomUUID();
    await applyAll(createItem(shelf, 'Shelf'));
    await applyAll(wireMutation('item.edit', shelf, { name: 'Shelf (web)' }, { baseRevision: 1 }));

    const creates = Array.from({ length: 49 }, (_, index) =>
      createItem(randomUUID(), `Thing ${index}`)
    );
    const stale = wireMutation('item.edit', shelf, { name: 'Shelf (phone)' }, { baseRevision: 1 });
    const batch = [...creates.slice(0, 25), stale, ...creates.slice(25)];
    const eventsBefore = h.db.db.select().from(events).all().length;

    const response = await send(h.api, batch);
    expect(response.status).toBe(200);
    const body = response.body as {
      outcomes: { mutationId: string; status: string; field?: string }[];
      highWaterSeq: number;
    };
    expect(body.outcomes.map((outcome) => outcome.mutationId)).toEqual(
      batch.map((mutation) => mutation.mutationId)
    );
    expect(body.outcomes[25]).toMatchObject({ status: 'conflict', kind: 'field', field: 'name' });
    expect(body.outcomes.filter((outcome) => outcome.status === 'applied')).toHaveLength(49);

    const eventsAfter = h.db.db.select().from(events).all();
    expect(eventsAfter).toHaveLength(eventsBefore + 49);
    expect(body.highWaterSeq).toBe(eventsAfter.at(-1)?.seq);
  });

  it('replays a retried batch from stored outcomes without writing again', async () => {
    const batch = [createItem(randomUUID(), 'Lamp')];
    const first = await send(h.api, batch);
    const count = h.db.db.select().from(events).all().length;
    const retry = await send(h.api, batch);

    expect(retry.body).toEqual(first.body);
    expect(h.db.db.select().from(events).all()).toHaveLength(count);
  });

  it('refuses a create whose code is already held as one code_collision, creating nothing (POPS-4063)', async () => {
    const first = randomUUID();
    const second = randomUUID();
    const withCode = (id: string, name: string): ReturnType<typeof createItem> =>
      wireMutation('item.create', id, {
        item: { name, placement: { kind: 'hand' } },
        code: 'B412',
      });

    const response = await send(h.api, [withCode(first, 'Lamp'), withCode(second, 'Kettle')]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      outcomes: [
        { status: 'applied', revision: 1 },
        {
          status: 'conflict',
          kind: 'code_collision',
          heldBy: { id: first, name: 'Lamp' },
          suggestedCode: 'B413',
        },
      ],
    });
    const snap = await snapshot(undefined, 50);
    expect(snap.items.map((row) => row.id)).toEqual([first]);
  });

  it('defers a mutation whose dependency has not applied, and stores nothing for it', async () => {
    const lamp = randomUUID();
    const missing = randomUUID();
    const response = await send(h.api, [
      wireMutation(
        'item.setCode',
        lamp,
        { code: 'L001' },
        { baseRevision: 1, dependsOn: [missing] }
      ),
    ]);
    expect(response.body).toMatchObject({ outcomes: [{ status: 'deferred', waitingOn: missing }] });
  });

  it.each([
    ['an empty batch', []],
    ['more than 50', Array.from({ length: 51 }, () => createItem(randomUUID(), 'x'))],
    ['a mutation without an id', [{ ...createItem(randomUUID(), 'x'), mutationId: 'nope' }]],
  ])('400s %s', async (_label, mutations) => {
    const response = await h.api.post('/sync/mutations').set(PROTOCOL).send({ mutations });
    expect(response.status).toBe(400);
  });
});
