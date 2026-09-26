import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FixtureSchema } from '../../contract/rest-fixtures.js';
import { WebConnectionsResponseSchema as WebConnectionsSchema } from '../../contract/rest-web-connections.js';
import { items, type Lifecycle } from '../../db/index.js';
import {
  createItem,
  openSyncHarness,
  send,
  type SyncHarness,
  type wireMutation,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let h: SyncHarness;

beforeEach(() => {
  h = openSyncHarness(transport);
});

afterEach(() => h.close());

async function apply(...mutations: ReturnType<typeof wireMutation>[]): Promise<void> {
  const response = await send(h.api, mutations);
  expect(response.status).toBe(200);
}

async function list(query: Record<string, string | number> = {}) {
  const response = await h.api.get('/web/connections').query(query);
  expect(response.status).toBe(200);
  return WebConnectionsSchema.parse(response.body);
}

async function fixture(name: string, type = 'power'): Promise<string> {
  const response = await h.api.post('/fixtures').send({ name, type, locationId: null });
  expect(response.status).toBe(201);
  return FixtureSchema.parse(response.body.data).id;
}

async function connectItems(itemAId: string, itemBId: string): Promise<void> {
  const response = await h.api.post('/connections').send({ itemAId, itemBId });
  expect(response.status).toBe(201);
}

async function connectFixture(itemId: string, fixtureId: string): Promise<void> {
  const response = await h.api.post(`/items/${itemId}/fixtures/${fixtureId}`).send({});
  expect(response.status).toBe(201);
}

function setCode(id: string, code: string): void {
  h.db.db.update(items).set({ code }).where(eq(items.id, id)).run();
}

function setLifecycle(id: string, lifecycle: Lifecycle): void {
  h.db.db.update(items).set({ lifecycle }).where(eq(items.id, id)).run();
}

function setDeleted(id: string): void {
  h.db.db
    .update(items)
    .set({ deletedAt: '2026-09-26T00:00:00.000Z' })
    .where(eq(items.id, id))
    .run();
}

describe('GET /web/connections', () => {
  it('an item edge appears once with the alphabetically first end as item', async () => {
    const first = randomUUID();
    const second = randomUUID();
    await apply(createItem(first, 'Zeta'), createItem(second, 'alpha'));
    await connectItems(first, second);

    const page = await list();

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      id: expect.stringMatching(/^item:/u),
      item: { id: second, name: 'alpha', kind: 'item' },
      far: { id: first, name: 'Zeta', kind: 'item' },
    });
  });

  it('a fixture edge carries the fixture as far', async () => {
    const itemId = randomUUID();
    await apply(createItem(itemId, 'Lamp'));
    const fixtureId = await fixture('Living room outlet', 'power');
    await connectFixture(itemId, fixtureId);

    const [row] = (await list()).rows;

    expect(row).toMatchObject({
      id: expect.stringMatching(/^fixture:/u),
      item: { id: itemId, name: 'Lamp', kind: 'item' },
      far: {
        id: fixtureId,
        name: 'Living room outlet',
        type: 'power',
        locationId: null,
        kind: 'fixture',
      },
    });
  });

  it('kind narrows to item or fixture rows', async () => {
    const itemA = randomUUID();
    const itemB = randomUUID();
    await apply(createItem(itemA, 'Alpha'), createItem(itemB, 'Beta'));
    await connectItems(itemA, itemB);
    const fixtureId = await fixture('Outlet');
    await connectFixture(itemA, fixtureId);

    expect((await list({ kind: 'item' })).rows).toHaveLength(1);
    expect((await list({ kind: 'item' })).rows[0]?.far.kind).toBe('item');
    expect((await list({ kind: 'fixture' })).rows).toHaveLength(1);
    expect((await list({ kind: 'fixture' })).rows[0]?.far.kind).toBe('fixture');
  });

  it("q matches either end's name or code and the fixture name", async () => {
    const near = randomUUID();
    const far = randomUUID();
    await apply(createItem(near, 'Near item'), createItem(far, 'Far item'));
    setCode(near, 'NEAR-CODE');
    setCode(far, 'FAR-CODE');
    await connectItems(near, far);
    const fixtureId = await fixture('Dishwasher outlet');
    await connectFixture(near, fixtureId);

    expect((await list({ q: 'far-code' })).rows).toHaveLength(1);
    expect((await list({ q: 'dishwasher' })).rows).toHaveLength(1);
    expect((await list({ q: 'missing-connection' })).summary).toEqual({
      connections: 0,
      items: 0,
      fixtures: 0,
    });
  });

  it('summary counts connections, distinct items and fixtures over the filter', async () => {
    const alpha = randomUUID();
    const beta = randomUUID();
    const gamma = randomUUID();
    await apply(createItem(alpha, 'Alpha'), createItem(beta, 'Beta'), createItem(gamma, 'Gamma'));
    await connectItems(alpha, beta);
    await connectItems(alpha, gamma);
    const outlet = await fixture('Shared outlet');
    await connectFixture(beta, outlet);
    await connectFixture(gamma, outlet);

    expect((await list()).summary).toEqual({ connections: 4, items: 3, fixtures: 1 });
    expect((await list({ kind: 'fixture' })).summary).toEqual({
      connections: 2,
      items: 2,
      fixtures: 1,
    });
  });

  it('an empty database returns no rows and a zero summary', async () => {
    expect(await list()).toEqual({
      rows: [],
      nextCursor: null,
      summary: { connections: 0, items: 0, fixtures: 0 },
    });
  });

  it('a disconnected item edge and a disconnected fixture edge are absent and connections drops by one each', async () => {
    const itemA = randomUUID();
    const itemB = randomUUID();
    await apply(createItem(itemA, 'Alpha'), createItem(itemB, 'Beta'));
    await connectItems(itemA, itemB);
    const fixtureId = await fixture('Outlet');
    await connectFixture(itemA, fixtureId);

    expect((await list()).summary.connections).toBe(2);
    const itemDisconnect = await h.api
      .delete('/connections')
      .query({ itemAId: itemA, itemBId: itemB });
    expect(itemDisconnect.status).toBe(200);
    expect((await list()).summary.connections).toBe(1);
    expect((await list()).rows.every((row) => row.id !== 'item:1')).toBe(true);

    const fixtureDisconnect = await h.api.delete(`/items/${itemA}/fixtures/${fixtureId}`).send({});
    expect(fixtureDisconnect.status).toBe(200);
    expect((await list()).summary).toEqual({ connections: 0, items: 0, fixtures: 0 });
  });

  it('pages without repeats or gaps and refuses a foreign cursor', async () => {
    const fixtureId = await fixture('Shared outlet');
    const itemIds = await Promise.all(
      ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map(async (name) => {
        const id = randomUUID();
        await apply(createItem(id, name));
        await connectFixture(id, fixtureId);
        return id;
      })
    );
    expect(itemIds).toHaveLength(5);

    const full = await list();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page = await list({ limit: 2, ...(cursor === undefined ? {} : { cursor }) });
      seen.push(...page.rows.map((row) => row.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(seen).toEqual(full.rows.map((row) => row.id));
    expect(new Set(seen).size).toBe(seen.length);
    const foreignCursor = Buffer.from(
      JSON.stringify({ v: 3, t: 'web-items', sort: null, q: false, after: 'item' })
    ).toString('base64url');
    const response = await h.api.get('/web/connections').query({ cursor: foreignCursor });
    expect(response.status).toBe(400);
  });

  it('edges touching a deleted item are excluded; inactive items are kept', async () => {
    const deleted = randomUUID();
    const inactive = randomUUID();
    const live = randomUUID();
    await apply(
      createItem(deleted, 'Deleted'),
      createItem(inactive, 'Inactive'),
      createItem(live, 'Live')
    );
    setDeleted(deleted);
    setLifecycle(inactive, 'retired');
    await connectItems(deleted, live);
    await connectItems(inactive, live);
    const outlet = await fixture('Outlet');
    await connectFixture(deleted, outlet);
    await connectFixture(inactive, outlet);

    const page = await list();

    expect(page.rows).toHaveLength(2);
    expect(page.rows.every((row) => row.item.id !== deleted && row.far.id !== deleted)).toBe(true);
    expect(page.rows.some((row) => row.item.id === inactive)).toBe(true);
    expect(page.rows.some((row) => row.item.lifecycle === 'retired')).toBe(true);
  });
});
