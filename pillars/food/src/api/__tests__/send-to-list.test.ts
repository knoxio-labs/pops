/**
 * Integration tests for the send-to-list REST surface, which writes to the
 * lists pillar over HTTP. A stub `ListsClient` is injected via
 * `deps.listsClient`, recording the cross-pillar calls so the flow is
 * exercised end-to-end without a live lists-api. Aggregation maths live in
 * the db-layer tests; here we assert the wire envelopes + target handling.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
import { createFoodApiApp } from '../app.js';
import {
  type ListHeader,
  type ListsClient,
  type UpsertByRefBody,
} from '../modules/recipes/send-to-list/lists-client.js';
import { makeClient } from './test-utils.js';

const DSL = `@recipe(slug="grilled-cheese", title="Grilled Cheese", servings=1)
@yield(bread, 1:count)
@ingredient(1, bread, 2:count)
@ingredient(2, butter, 10:g)
@ingredient(3, cheddar, 60:g)
@step("Assemble @1 @2 @3 and grill.")
`;

interface StubState {
  created: { name: string }[];
  upserts: { listId: number; body: UpsertByRefBody }[];
  updates: { itemId: number; label: string }[];
  itemsByRef: Map<string, { id: number; qty: number | null; label: string }>;
  lists: Map<number, ListHeader>;
}

function makeStubClient(state: StubState): ListsClient {
  let nextId = 100;
  let nextItemId = 200;
  return {
    getList: (id) => Promise.resolve(state.lists.get(id) ?? null),
    createShoppingList: (name) => {
      state.created.push({ name });
      const id = (nextId += 1);
      state.lists.set(id, { id, kind: 'shopping', ownerApp: 'food', archivedAt: null });
      return Promise.resolve(id);
    },
    upsertByRef: (listId, body) => {
      state.upserts.push({ listId, body });
      const key = `${listId}:${body.refKind}:${body.refId}`;
      const existing = state.itemsByRef.get(key);
      if (existing !== undefined) {
        existing.qty =
          existing.qty === null && (body.qty ?? null) === null
            ? null
            : (existing.qty ?? 0) + (body.qty ?? 0);
        existing.label = body.label;
        return Promise.resolve({
          outcome: 'merged' as const,
          itemId: existing.id,
          qty: existing.qty,
        });
      }
      nextItemId += 1;
      const inserted = { id: nextItemId, qty: body.qty ?? null, label: body.label };
      state.itemsByRef.set(key, inserted);
      return Promise.resolve({
        outcome: 'inserted' as const,
        itemId: inserted.id,
        position: state.itemsByRef.size - 1,
      });
    },
    updateItem: (itemId, body) => {
      state.updates.push({ itemId, label: body.label });
      for (const item of state.itemsByRef.values()) {
        if (item.id === itemId) item.label = body.label;
      }
      return Promise.resolve();
    },
    addItem: () => Promise.resolve(),
    searchShoppingListIdsByNotes: () => Promise.resolve([]),
  };
}

let tmpDir: string;
let foodDb: OpenedFoodDb;
let state: StubState;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({
      foodDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
      listsClient: makeStubClient(state),
    })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-send-to-list-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  state = { created: [], upserts: [], updates: [], itemsByRef: new Map(), lists: new Map() };
  createIngredient(foodDb.db, { name: 'Bread', slug: 'bread', defaultUnit: 'count' });
  createIngredient(foodDb.db, { name: 'Butter', slug: 'butter', defaultUnit: 'g' });
  createIngredient(foodDb.db, { name: 'Cheddar', slug: 'cheddar', defaultUnit: 'g' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('send-to-list REST', () => {
  it('previews a compiled version and sends to a new shopping list via REST', async () => {
    const api = client();
    const created = await api.recipes.create(DSL);

    const preview = await api.sendToList.prepare(created.versionId);
    expect(preview.recipeTitle).toBe('Grilled Cheese');
    expect(preview.canonicalItems.length).toBeGreaterThan(0);

    const res = await api.sendToList.send(created.versionId, { kind: 'new', name: 'Groceries' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.addedCount).toBeGreaterThan(0);
      expect(state.created).toEqual([{ name: 'Groceries' }]);
      expect(state.upserts.length).toBe(res.addedCount);
      expect(state.upserts[0]?.body.onConflict).toBe('merge-additive');
    }
  });

  it('regenerates merged labels from cumulative quantities and bounds notes', async () => {
    const api = client();
    const created = await api.recipes.create(DSL);
    const firstSend = await api.sendToList.send(created.versionId, {
      kind: 'new',
      name: 'Groceries',
    });
    expect(firstSend.ok).toBe(true);
    const listId = firstSend.ok ? firstSend.listId : 0;
    const itemCount = state.itemsByRef.size;
    const upsertCount = state.upserts.length;

    const secondSend = await client().sendToList.send(created.versionId, {
      kind: 'existing',
      listId,
    });

    expect(secondSend).toMatchObject({ ok: true, addedCount: 0 });
    if (!secondSend.ok) throw new Error('the existing shopping list should accept the send');
    expect(secondSend.mergedCount).toBe(itemCount);
    expect(state.upserts.slice(upsertCount)).toHaveLength(itemCount);
    expect(
      state.upserts
        .slice(upsertCount)
        .every(
          ({ body }) => body.notesMerge?.separator === '; ' && body.notesMerge.maxLength === 500
        )
    ).toBe(true);
    expect(state.updates).toHaveLength(itemCount);

    for (const item of state.itemsByRef.values()) {
      if (item.qty === null) throw new Error('food mergeable items have a cumulative quantity');
      expect(Number(item.label.split(' ')[0])).toBe(item.qty);
    }
  });

  it('rejects a non-shopping existing target', async () => {
    state.lists.set(7, { id: 7, kind: 'todo', ownerApp: 'x', archivedAt: null });
    const api = client();
    const created = await api.recipes.create(DSL);
    const res = await api.sendToList.send(created.versionId, { kind: 'existing', listId: 7 });
    expect(res).toEqual({ ok: false, reason: 'TargetListNotShopping' });
  });

  it('404s prepare for an unknown version', async () => {
    await expect(client().sendToList.prepare(999999)).rejects.toMatchObject({ status: 404 });
  });
});
