import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { SyncEventSchema } from '../../contract/rest-sync-schemas.js';
import {
  ACTIVITY_KIND_GROUPS,
  HISTORY_KIND_GROUPS,
  WebEventsResponseSchema,
} from '../../contract/rest-web-events.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { runMutation, type CommandActor, type Mutation } from '../../domain/commands/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { Express } from 'express';

const transport = createTestTransport();
const itemDetailSchema = z.object({
  history: z.object({ events: z.array(SyncEventSchema) }),
});

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;
let api: BoundAgent;
let ids: Map<string, string>;

function idFor(label: string): string {
  const existing = ids.get(label);
  if (existing !== undefined) return existing;
  const id = randomUUID();
  ids.set(label, id);
  return id;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-web-events-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  ids = new Map();
  const app: Express = createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3005',
  });
  api = transport.requestOn(app);
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function apply(
  op: string,
  entityId: string,
  args: unknown,
  actor: CommandActor = { kind: 'web' },
  baseRevision: number | null = null
): void {
  const mutation: Mutation = {
    mutationId: randomUUID(),
    op,
    entityId: idFor(entityId),
    baseRevision,
    dependsOn: [],
    clientTime: '2026-09-26T00:00:00.000Z',
    args,
  };
  const outcome = runMutation(inventoryDb.db, mutation, actor, {
    now: () => '2026-09-26T00:00:00.000Z',
  });
  if (outcome.status !== 'applied') {
    throw new Error(`${op} for ${entityId} was ${JSON.stringify(outcome)}`);
  }
}

function createLocation(id: string, name: string, actor: CommandActor = { kind: 'web' }): void {
  apply('location.create', id, { location: { name, parentId: null } }, actor);
}

type ItemPlacement =
  | { readonly kind: 'hand' }
  | { readonly kind: 'location'; readonly locationId: string };

function createItem(
  id: string,
  name: string,
  placement: ItemPlacement = { kind: 'hand' },
  actor: CommandActor = { kind: 'web' }
): void {
  const resolvedPlacement =
    placement.kind === 'location'
      ? { kind: placement.kind, locationId: idFor(placement.locationId) }
      : placement;
  apply('item.create', id, { item: { name, placement: resolvedPlacement } }, actor);
}

function moveToLocation(
  itemId: string,
  locationId: string,
  verb: 'move' | 'store' = 'move',
  actor: CommandActor = { kind: 'web' },
  baseRevision = 1
): void {
  apply(
    'item.move',
    itemId,
    { to: { kind: 'location', locationId: idFor(locationId) }, verb },
    actor,
    baseRevision
  );
}

async function eventsPage(query: Record<string, string | number> = {}) {
  const normalizedQuery =
    typeof query.entityId === 'string' ? { ...query, entityId: idFor(query.entityId) } : query;
  const response = await api.get('/web/events').query(normalizedQuery);
  expect(response.status).toBe(200);
  return WebEventsResponseSchema.parse(response.body);
}

describe('GET /web/events', () => {
  it('returns item and location events newest first with entity names', async () => {
    createLocation('garage', 'Garage');
    createItem('lamp', 'Lamp', { kind: 'location', locationId: 'garage' });
    createItem('cable', 'Cable');

    const page = await eventsPage();

    expect(
      page.events.map((event) => [event.entityKind, event.entityId, event.entityName])
    ).toEqual([
      ['item', idFor('cable'), 'Cable'],
      ['item', idFor('lamp'), 'Lamp'],
      ['location', idFor('garage'), 'Garage'],
    ]);
    expect(page.events.map((event) => event.seq)).toEqual([3, 2, 1]);
  });

  it('an empty database returns no events, total 0 and empty kindCounts', async () => {
    await expect(eventsPage()).resolves.toEqual({
      events: [],
      nextCursor: null,
      kindCounts: {},
      total: 0,
    });
  });

  it('pages by seq without repeats or gaps', async () => {
    for (const id of ['one', 'two', 'three', 'four', 'five']) createItem(id, id);

    const seen: number[] = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page = await eventsPage({ limit: 2, ...(cursor === undefined ? {} : { cursor }) });
      seen.push(...page.events.map((event) => event.seq));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(seen).toEqual([5, 4, 3, 2, 1]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('kind filters to the listed kinds and an unknown kind matches nothing', async () => {
    createLocation('garage', 'Garage');
    createItem('lamp', 'Lamp');
    moveToLocation('lamp', 'garage', 'store');

    const stored = await eventsPage({ kind: 'stored' });
    expect(stored.events.map((event) => event.kind)).toEqual(['stored']);
    expect(stored.total).toBe(3);
    expect(stored.kindCounts).toEqual({ created: 2, stored: 1 });

    const unknown = await eventsPage({ kind: 'future_kind' });
    expect(unknown.events).toEqual([]);
    expect(unknown.total).toBe(3);
    expect(unknown.kindCounts).toEqual({ created: 2, stored: 1 });
  });

  it('a stored event is returned by the placement group of both maps', async () => {
    createLocation('garage', 'Garage');
    createItem('lamp', 'Lamp');
    moveToLocation('lamp', 'garage', 'store');

    const activity = await eventsPage({ kind: ACTIVITY_KIND_GROUPS.placement.join(',') });
    const history = await eventsPage({ kind: HISTORY_KIND_GROUPS.placement.join(',') });

    expect(activity.events.map((event) => event.kind)).toContain('stored');
    expect(history.events.map((event) => event.kind)).toContain('stored');
  });

  it('actorKind and kind combine', async () => {
    createItem('web-item', 'Web item');
    createItem(
      'service-item',
      'Service item',
      { kind: 'hand' },
      { kind: 'service', id: 'importer' }
    );

    const page = await eventsPage({ kind: 'created', actorKind: 'service' });

    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({ entityId: idFor('service-item'), kind: 'created' });
    expect(page.total).toBe(1);
    expect(page.kindCounts).toEqual({ created: 1 });
  });

  it("entityId equals the item's own history, including fields, before, after, reason and actor", async () => {
    createLocation('garage', 'Garage');
    createItem('lamp', 'Lamp');
    apply(
      'item.setCode',
      'lamp',
      { code: 'L-1' },
      { kind: 'device', id: 'phone', label: 'Phone' },
      1
    );
    moveToLocation('lamp', 'garage', 'move', { kind: 'device', id: 'phone', label: 'Phone' }, 2);

    const page = await eventsPage({ entityId: 'lamp' });
    const detailResponse = await api.get(`/web/items/${idFor('lamp')}`);
    expect(detailResponse.status).toBe(200);
    const detail = itemDetailSchema.parse(detailResponse.body);

    expect(page.events.map(({ entityName: _entityName, ...event }) => event)).toEqual(
      detail.history.events
    );
  });

  it('entityId with no events, or with a kind it has none of, returns nothing', async () => {
    createItem('lamp', 'Lamp');
    createItem('cable', 'Cable');

    expect((await eventsPage({ entityId: 'missing' })).events).toEqual([]);
    expect((await eventsPage({ entityId: 'lamp', kind: 'stored' })).events).toEqual([]);
  });

  it("q matches the entity name, including a deleted item's", async () => {
    createItem('snorkel', 'Snorkel');
    apply('item.delete', 'snorkel', {}, { kind: 'web' }, 1);

    const page = await eventsPage({ q: 'SNORKEL' });

    expect(page.events).toHaveLength(2);
    expect(page.events.every((event) => event.entityName === 'Snorkel')).toBe(true);
  });

  it('q matches a touched field name and a text value in before or after', async () => {
    createItem('lamp', 'Lamp');
    apply('item.setCode', 'lamp', { code: 'SKU-123' }, { kind: 'web' }, 1);

    expect((await eventsPage({ q: 'CODE' })).events.map((event) => event.kind)).toEqual([
      'code_set',
    ]);
    expect((await eventsPage({ q: 'sku-123' })).events.map((event) => event.kind)).toEqual([
      'code_set',
    ]);
  });

  it('q matches the name of a place referenced by id in a move', async () => {
    createLocation('garage', 'Garage');
    createItem('lamp', 'Lamp');
    moveToLocation('lamp', 'garage');

    const page = await eventsPage({ q: 'garage' });

    expect(page.events.map((event) => event.kind)).toEqual(['moved', 'created']);
  });

  it('kindCounts and total ignore kind but honour actorKind, entityId and q', async () => {
    createItem('target', 'Target');
    apply('item.setCode', 'target', { code: 'T-1' }, { kind: 'web' }, 1);
    createItem('other', 'Other');
    apply('item.setCode', 'other', { code: 'O-1' }, { kind: 'service', id: 'importer' }, 1);

    const page = await eventsPage({
      kind: 'code_set',
      actorKind: 'web',
      entityId: 'target',
      q: 'target',
    });

    expect(page.events.map((event) => event.kind)).toEqual(['code_set']);
    expect(page.total).toBe(2);
    expect(page.kindCounts).toEqual({ code_set: 1, created: 1 });
  });

  it('a superseded event is not undoable and a revert names compensatesSeq', async () => {
    createItem('lamp', 'Lamp');
    apply('item.setCode', 'lamp', { code: 'L-1' }, { kind: 'web' }, 1);
    apply('item.setCode', 'lamp', { code: 'L-2' }, { kind: 'web' }, 2);
    apply('event.revert', 'lamp', { seq: 3 }, { kind: 'web' });

    const page = await eventsPage({ entityId: 'lamp' });
    const secondCode = page.events.find((event) => event.seq === 3);
    const reverted = page.events.find((event) => event.compensatesSeq === 3);

    expect(secondCode?.undoable).toBe(false);
    expect(reverted).toMatchObject({ kind: 'reverted', compensatesSeq: 3 });
  });

  it('a foreign cursor is a 400', async () => {
    const foreignCursor = Buffer.from(
      JSON.stringify({ v: 3, t: 'web-items', sort: null, q: false, after: 'item' })
    ).toString('base64url');

    const response = await api.get('/web/events').query({ cursor: foreignCursor });

    expect(response.status).toBe(400);
  });
});
