/**
 * The `/mobile/inventory/items/:id/parts` relay, end to end through the real
 * app and gateway with only inventory's network replaced.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createInventoryFake } from './inventory-fake.js';
import { closeOpenedApps, get, openWith } from './mobile-inventory-app.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

afterEach(closeOpenedApps);

const VIEW = {
  canHaveParts: true,
  assembly: null,
  parts: [
    {
      itemId: 'cup',
      name: 'Cup',
      code: null,
      typeId: 'type-cup',
      lifecycle: 'active',
      placement: {
        kind: 'container',
        locationId: null,
        locationName: null,
        containingItemId: 'box',
        containingItemName: 'Ninja blender',
      },
    },
  ],
};

function withAuth<T extends { set(name: string, value: string): T }>(request: T, token: string): T {
  return request.set('Authorization', `Bearer ${token}`);
}

function post(app: Express, token: string, path: string, body: object) {
  return requestOn(app, (r) => withAuth(r.post(path).send(body), token));
}

function del(app: Express, token: string, path: string) {
  return requestOn(app, (r) => withAuth(r.delete(path), token));
}

describe('reading parts', () => {
  it('relays the assembly view field for field, unwrapping inventory’s data envelope', async () => {
    const fake = createInventoryFake({
      partsResult: () => ({ kind: 'ok', value: { data: VIEW } }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.read']);

    const res = await get(app, token, '/mobile/inventory/items/kit/parts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(VIEW);
    expect(fake.partsCalls).toEqual([{ procedure: 'getParts', input: { itemId: 'kit' } }]);
  });

  it('answers 404 for an item inventory does not know', async () => {
    const fake = createInventoryFake({
      partsResult: () => ({ kind: 'not-found', pillar: 'inventory', message: 'no such item' }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.read']);

    const res = await get(app, token, '/mobile/inventory/items/missing/parts');

    expect(res.status).toBe(404);
  });

  it('refuses a producer answer missing a key the phone decodes strictly', async () => {
    const { parts: _parts, ...withoutParts } = VIEW;
    const fake = createInventoryFake({
      partsResult: () => ({ kind: 'ok', value: { data: withoutParts } }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.read']);

    const res = await get(app, token, '/mobile/inventory/items/kit/parts');

    expect(res.status).toBe(502);
  });

  it('refuses a device without inventory.read', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await get(app, token, '/mobile/inventory/items/kit/parts');

    expect(res.status).toBe(403);
    expect(fake.partsCalls).toEqual([]);
  });
});

describe('adding a part', () => {
  it('forwards the pair and answers the updated view', async () => {
    const fake = createInventoryFake({
      partsResult: () => ({ kind: 'ok', value: { data: VIEW } }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/items/kit/parts', { partItemId: 'cup' });

    expect(res.status).toBe(200);
    expect(res.body.parts[0].itemId).toBe('cup');
    expect(fake.partsCalls).toEqual([
      { procedure: 'addPart', input: { itemId: 'kit', partItemId: 'cup' } },
    ]);
  });

  it('relays inventory’s conflict with its own message, not a generic upstream fault', async () => {
    const fake = createInventoryFake({
      partsResult: () => ({
        kind: 'conflict',
        pillar: 'inventory',
        code: 'inventory.resource.conflict',
        message: "Item 'cup' is already a part of 'other'; remove it there first",
      }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/items/kit/parts', { partItemId: 'cup' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already a part of');
  });

  it('rejects an empty part id before reaching inventory', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await post(app, token, '/mobile/inventory/items/kit/parts', { partItemId: '' });

    expect(res.status).toBe(400);
    expect(fake.partsCalls).toEqual([]);
  });

  it('refuses a device without inventory.write', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.read']);

    const res = await post(app, token, '/mobile/inventory/items/kit/parts', { partItemId: 'cup' });

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('inventory.write');
  });
});

describe('removing a part', () => {
  it('forwards the pair and answers the updated view', async () => {
    const fake = createInventoryFake();
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await del(app, token, '/mobile/inventory/items/kit/parts/cup');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ canHaveParts: true, assembly: null, parts: [] });
    expect(fake.partsCalls).toEqual([
      { procedure: 'removePart', input: { itemId: 'kit', partItemId: 'cup' } },
    ]);
  });

  it('answers 404 when the item is not a part of that assembly', async () => {
    const fake = createInventoryFake({
      partsResult: () => ({ kind: 'not-found', pillar: 'inventory', message: 'not a part' }),
    });
    const { app, token } = openWith(fake.factory, ['inventory.write']);

    const res = await del(app, token, '/mobile/inventory/items/kit/parts/cup');

    expect(res.status).toBe(404);
  });
});
