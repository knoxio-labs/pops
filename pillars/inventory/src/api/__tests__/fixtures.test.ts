import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FixtureSchema } from '../../contract/rest-fixtures.js';
import { SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';
import { makeClient } from './test-utils.js';

const transport = createTestTransport();
let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-fixtures-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function api() {
  const app = createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
  });
  return { client: makeClient(app), request: transport.requestOn(app) };
}

async function createFixture(
  request: ReturnType<typeof transport.requestOn>,
  input: { name: string; type: string; locationId: string | null }
) {
  const response = await request.post('/fixtures').send(input);
  expect(response.status).toBe(201);
  return FixtureSchema.parse(response.body.data);
}

describe('fixtures REST', () => {
  it('applies search and location filters together and independently', async () => {
    const { client, request } = api();
    const room = await client.locations.create({ name: 'Room' });
    const garage = await client.locations.create({ name: 'Garage' });
    const roomLamp = await createFixture(request, {
      name: 'Desk lamp',
      type: 'power',
      locationId: room.data.id,
    });
    const roomFan = await createFixture(request, {
      name: 'Ceiling fan',
      type: 'power',
      locationId: room.data.id,
    });
    const garageLamp = await createFixture(request, {
      name: 'Garage lamp',
      type: 'switch',
      locationId: garage.data.id,
    });

    const search = await request.get('/fixtures').query({ search: 'LAMP' });
    expect(search.status).toBe(200);
    expect(search.body.data.map((fixture: { id: string }) => fixture.id)).toEqual(
      expect.arrayContaining([roomLamp.id, garageLamp.id])
    );
    expect(search.body.data).toHaveLength(2);
    expect(search.body.total).toBe(2);

    const location = await request.get('/fixtures').query({ locationId: room.data.id });
    expect(location.status).toBe(200);
    expect(location.body.data.map((fixture: { id: string }) => fixture.id)).toEqual(
      expect.arrayContaining([roomLamp.id, roomFan.id])
    );
    expect(location.body.data).toHaveLength(2);
    expect(location.body.total).toBe(2);

    const combined = await request
      .get('/fixtures')
      .query({ search: 'lamp', locationId: room.data.id, type: 'power' });
    expect(combined.status).toBe(200);
    expect(combined.body.data.map((fixture: { id: string }) => fixture.id)).toEqual([roomLamp.id]);
    expect(combined.body.total).toBe(1);
  });

  it('lists projected live items connected to a fixture with offset pagination', async () => {
    const { client, request } = api();
    const fixture = await createFixture(request, {
      name: 'Desk power',
      type: 'power',
      locationId: null,
    });
    const first = await client.items.create({ itemName: 'Lamp' });
    const second = await client.items.create({ itemName: 'Monitor' });
    const unrelated = await client.items.create({ itemName: 'Unrelated' });
    expect(
      (await request.post(`/items/${first.data.id}/fixtures/${fixture.id}`).send({})).status
    ).toBe(201);
    expect(
      (await request.post(`/items/${second.data.id}/fixtures/${fixture.id}`).send({})).status
    ).toBe(201);

    const firstPage = await request
      .get(`/fixtures/${fixture.id}/items`)
      .query({ limit: 1, offset: 0 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.pagination).toEqual({ hasMore: true, limit: 1, offset: 0, total: 2 });
    expect(firstPage.body.data.map((item: unknown) => SyncItemSchema.parse(item).name)).toEqual([
      'Lamp',
    ]);

    const secondPage = await request
      .get(`/fixtures/${fixture.id}/items`)
      .query({ limit: 1, offset: 1 });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.pagination).toEqual({ hasMore: false, limit: 1, offset: 1, total: 2 });
    expect(secondPage.body.data.map((item: unknown) => SyncItemSchema.parse(item).name)).toEqual([
      'Monitor',
    ]);
    expect(secondPage.body.data.some((item: { id: string }) => item.id === unrelated.data.id)).toBe(
      false
    );
  });
});
