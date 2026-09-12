/**
 * Integration tests for the `containers.*` REST surface in
 * pops-inventory-api.
 *
 * Boots the Express app via `createInventoryApiApp` against a per-test
 * temp inventory.db and drives endpoints through supertest (see
 * `makeClient`). Domain errors translate to HTTP status: NotFound → 404,
 * zod failures → 400 — mirrors `locations.test.ts`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';
import { makeClient } from './test-utils.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-container-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('containers REST — happy paths', () => {
  it('creates, lists, gets, then deletes a container', async () => {
    const api = client();
    const created = await api.containers.create({ label: 'Kitchen box 1' });
    expect(created.data.label).toBe('Kitchen box 1');
    expect(created.data.state).toBe('open');

    const list = await api.containers.list();
    expect(list.total).toBe(1);
    expect(list.data[0]?.label).toBe('Kitchen box 1');

    const fetched = await api.containers.get(created.data.id);
    expect(fetched.data.label).toBe('Kitchen box 1');

    const ack = await api.containers.delete(created.data.id);
    expect(ack).toEqual({ message: 'Container deleted' });

    const after = await api.containers.list();
    expect(after.total).toBe(0);
  });

  it('seals then unpacks a container', async () => {
    const api = client();
    const created = await api.containers.create({ label: 'Box' });

    const sealed = await api.containers.seal(created.data.id);
    expect(sealed.data.state).toBe('sealed');

    const unpacked = await api.containers.unpack(created.data.id);
    expect(unpacked.data.state).toBe('unpacked');
  });

  it('updates label, code and notes', async () => {
    const api = client();
    const created = await api.containers.create({ label: 'Old label' });
    const updated = await api.containers.update(created.data.id, {
      label: 'New label',
      code: 'BOX-042',
      notes: 'handle with care',
    });
    expect(updated.data.label).toBe('New label');
    expect(updated.data.code).toBe('BOX-042');
    expect(updated.data.notes).toBe('handle with care');
  });

  it('filters the list by state', async () => {
    const api = client();
    const sealed = await api.containers.create({ label: 'Sealed box' });
    await api.containers.seal(sealed.data.id);
    await api.containers.create({ label: 'Open box' });

    const filtered = await api.containers.list({ state: 'sealed' });
    expect(filtered.data.map((c) => c.label)).toEqual(['Sealed box']);
  });
});

describe('containers REST — assigning and moving items (POPS-3581)', () => {
  it("an item's containerId can be looked up, and filtered by, from items.list", async () => {
    const api = client();
    const box = await api.containers.create({ label: 'Box' });
    const item = await api.items.create({ itemName: 'Kettle', containerId: box.data.id });
    expect(item.data.containerId).toBe(box.data.id);

    const filtered = await api.items.list({ containerId: box.data.id });
    expect(filtered.data.map((i) => i.id)).toEqual([item.data.id]);
  });

  it("a container's contents can be listed from the container side", async () => {
    const api = client();
    const box = await api.containers.create({ label: 'Box' });
    const kettle = await api.items.create({ itemName: 'Kettle', containerId: box.data.id });
    const toaster = await api.items.create({ itemName: 'Toaster', containerId: box.data.id });
    await api.items.create({ itemName: 'Unrelated lamp' });

    const contents = await api.containers.items(box.data.id);
    expect(contents.data.map((i) => i.id).toSorted()).toEqual(
      [kettle.data.id, toaster.data.id].toSorted()
    );
  });

  it(
    'moving a container relocates every item inside it — the exact cascade the ' +
      'ticket asks a REST test to prove',
    async () => {
      const api = client();
      const garage = await api.locations.create({ name: 'Garage' });
      const storageUnit = await api.locations.create({ name: 'Storage unit' });

      const box = await api.containers.create({
        label: 'Box',
        originLocationId: garage.data.id,
      });
      const kettle = await api.items.create({ itemName: 'Kettle', containerId: box.data.id });
      const toaster = await api.items.create({ itemName: 'Toaster', containerId: box.data.id });
      const unrelated = await api.items.create({ itemName: 'Unrelated lamp' });

      expect(kettle.data.locationId).toBe(garage.data.id);
      expect(toaster.data.locationId).toBe(garage.data.id);

      const moved = await api.containers.move(box.data.id, storageUnit.data.id);
      expect(moved.data.state).toBe('moved');
      expect(moved.data.currentLocationId).toBe(storageUnit.data.id);

      const contents = await api.containers.items(box.data.id);
      expect(contents.data).toHaveLength(2);
      for (const row of contents.data) {
        expect(row.locationId).toBe(storageUnit.data.id);
      }

      const unrelatedAfter = await api.items.get(unrelated.data.id);
      expect(unrelatedAfter.data.locationId).toBeNull();
    }
  );

  it('deleting a container empties it — its items survive with containerId cleared', async () => {
    const api = client();
    const box = await api.containers.create({ label: 'Box' });
    const kettle = await api.items.create({ itemName: 'Kettle', containerId: box.data.id });

    await api.containers.delete(box.data.id);

    const stillThere = await api.items.get(kettle.data.id);
    expect(stillThere.data.containerId).toBeNull();
  });
});

describe('containers REST — error mapping', () => {
  it('maps an unknown container to 404', async () => {
    await expect(client().containers.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('maps a missing origin location to 404 on create', async () => {
    await expect(
      client().containers.create({ label: 'Box', originLocationId: 'missing' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('maps a missing destination location to 404 on move', async () => {
    const api = client();
    const box = await api.containers.create({ label: 'Box' });
    await expect(api.containers.move(box.data.id, 'missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('maps a missing container to 404 on move', async () => {
    await expect(client().containers.move('nope', 'anywhere')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects an empty label at the zod boundary with 400', async () => {
    await expect(client().containers.create({ label: '' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('maps an item create with an unknown containerId to 404, rather than a raw constraint error', async () => {
    await expect(
      client().items.create({ itemName: 'Kettle', containerId: 'nope' })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('containers REST — raw HTTP wire smoke', () => {
  it('GET /containers answers 200 with an empty envelope', async () => {
    const app = createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
    const res = await requestOn(app).get('/containers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 0 });
  });
});
