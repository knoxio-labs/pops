/**
 * What the sync routes put on the wire: the event shape for moves (the
 * contract a Swift client decodes), `undoable`, an item's photos, documents
 * and provenance, and per-item history paging.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { SyncEventSchema, SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import { itemDocuments, itemFieldValues, items } from '../../db/index.js';
import {
  createItem,
  createLocation,
  openSyncHarness,
  paperless,
  PROTOCOL,
  send,
  wireMutation,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { z } from 'zod';

import type { DocumentsClient } from '../documents/client.js';

type SyncEvent = z.infer<typeof SyncEventSchema>;
type SyncItem = z.infer<typeof SyncItemSchema>;

const transport = createTestTransport();
let h: SyncHarness | undefined;

afterEach(() => {
  h?.close();
  h = undefined;
});

function harness(documents?: DocumentsClient): SyncHarness {
  h = openSyncHarness(transport, documents ? { documents } : {});
  return h;
}

async function apply(target: SyncHarness, ...mutations: ReturnType<typeof wireMutation>[]) {
  const response = await send(target.api, mutations);
  expect(response.status).toBe(200);
}

async function feed(target: SyncHarness): Promise<{ items: SyncItem[]; events: SyncEvent[] }> {
  const epoch = (await target.api.get('/sync/snapshot').set(PROTOCOL)).body.epoch as string;
  const response = await target.api.get('/sync/changes').set(PROTOCOL).query({ since: 0, epoch });
  expect(response.status).toBe(200);
  return {
    items: SyncItemSchema.array().parse(response.body.items),
    events: SyncEventSchema.array().parse(response.body.events),
  };
}

describe('move events on the wire', () => {
  it('carry placement and previousPlacement as typed placements on a pick-up and a put-back', async () => {
    const target = harness();
    const [shelf, mug] = [randomUUID(), randomUUID()];
    await apply(
      target,
      createLocation(shelf, 'Shelf'),
      createItem(mug, 'Mug', { kind: 'location', locationId: shelf }),
      wireMutation(
        'item.move',
        mug,
        { to: { kind: 'hand' }, verb: 'pick_up' },
        { baseRevision: 1 }
      ),
      wireMutation(
        'item.move',
        mug,
        { to: { kind: 'location', locationId: shelf }, verb: 'put_back' },
        { baseRevision: 2 }
      )
    );

    const { events } = await feed(target);
    const [pickUp, putBack] = events.filter((event) => event.entityId === mug).slice(1);
    expect(pickUp).toMatchObject({
      kind: 'picked_up',
      fields: ['placement', 'previousPlacement'],
      before: { placement: { kind: 'location', locationId: shelf }, previousPlacement: null },
      after: {
        placement: { kind: 'hand' },
        previousPlacement: { kind: 'location', locationId: shelf },
      },
      actor: { kind: 'web', label: 'Server' },
    });
    expect(putBack).toMatchObject({
      kind: 'put_back',
      before: {
        placement: { kind: 'hand' },
        previousPlacement: { kind: 'location', locationId: shelf },
      },
      after: { placement: { kind: 'location', locationId: shelf }, previousPlacement: null },
    });
  });

  it('marks an event undoable only while it is the latest change to its fields', async () => {
    const target = harness();
    const lamp = randomUUID();
    await apply(
      target,
      createItem(lamp, 'Lamp'),
      wireMutation('item.edit', lamp, { name: 'Desk lamp' }, { baseRevision: 1 }),
      wireMutation('item.setQuantity', lamp, { quantity: 2 }, { baseRevision: 2 }),
      wireMutation('item.edit', lamp, { name: 'Reading lamp' }, { baseRevision: 3 })
    );

    const { events } = await feed(target);
    expect(events.map((event) => [event.kind, event.undoable])).toEqual([
      ['created', false],
      ['edited', false],
      ['quantity_changed', true],
      ['edited', true],
    ]);
  });

  it('never marks a destruction undoable', async () => {
    const target = harness();
    const vase = randomUUID();
    await apply(
      target,
      createItem(vase, 'Vase'),
      wireMutation('item.setLifecycle', vase, { lifecycle: 'destroyed' }, { baseRevision: 1 })
    );
    const { events } = await feed(target);
    expect(events.at(-1)).toMatchObject({ kind: 'lifecycle_changed', undoable: false });
  });
});

describe('item rows on the wire', () => {
  it('carries protocol-2 stable identities and canonical persisted values beside the compatibility projection', async () => {
    const target = harness();
    const lamp = randomUUID();
    const typeId = '59538480-6e82-5ccc-b7be-f1cfd15b9af6';
    const fieldId = '147a262c-bb7c-51bf-b617-16d354228d91';
    await apply(target, createItem(lamp, 'Lamp'));
    target.db.db.update(items).set({ typeId }).where(eq(items.id, lamp)).run();
    target.db.db
      .insert(itemFieldValues)
      .values({
        itemId: lamp,
        fieldId,
        source: 'stored',
        ordinal: 0,
        valueJson: '{"amount":"800","unit":"lm"}',
        catalogueRevision: 1,
        createdAt: '2026-09-19T00:00:00.000Z',
        updatedAt: '2026-09-19T00:00:00.000Z',
      })
      .run();

    const { items: rows } = await feed(target);

    expect(rows).toContainEqual(
      expect.objectContaining({
        id: lamp,
        typeId,
        catalogueRevision: 1,
        typeKey: 'bulb',
        fieldValues: [
          {
            fieldId,
            source: 'stored',
            catalogueRevision: 1,
            values: [{ amount: '800', unit: 'lm' }],
          },
        ],
      })
    );
  });

  it('carry content-addressed photos in order and leave legacy file-only photos out', async () => {
    const target = harness();
    const lamp = randomUUID();
    await apply(target, createItem(lamp, 'Lamp'));
    const [first, second] = ['a'.repeat(64), 'b'.repeat(64)];
    const insertMedia = target.db.raw.prepare(
      `INSERT INTO media (sha256, mime, byte_size, stored_at) VALUES (?, 'image/jpeg', 1, '2026-09-19')`
    );
    insertMedia.run(first);
    insertMedia.run(second);
    const insertPhoto = target.db.raw.prepare(
      'INSERT INTO item_photos (item_id, media_sha256, file_path, caption, position) VALUES (?, ?, ?, ?, ?)'
    );
    insertPhoto.run(lamp, second, null, 'back', 1);
    insertPhoto.run(lamp, first, null, null, 0);
    insertPhoto.run(lamp, null, 'legacy/lamp.jpg', null, 2);

    const { items: rows } = await feed(target);
    expect(rows[0]?.photos).toEqual([
      { sha256: first, caption: null },
      { sha256: second, caption: 'back' },
    ]);
  });

  it.each([
    ['linked', { available: true }],
    ['unavailable', { available: false }],
    ['unavailable', { configured: false }],
  ] as const)('report documents as %s when Paperless says %j', async (expected, status) => {
    const target = harness(paperless(status));
    const [linked, bare] = [randomUUID(), randomUUID()];
    await apply(target, createItem(linked, 'Fridge'), createItem(bare, 'Chair'));
    target.db.db
      .insert(itemDocuments)
      .values({ itemId: linked, paperlessDocumentId: 7, documentType: 'manual', title: 'Manual' })
      .run();

    const { items: rows } = await feed(target);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(linked)).toMatchObject({
      documentsStatus: expected,
      documentTitles: ['Manual'],
    });
    expect(byId.get(bare)).toMatchObject({ documentsStatus: 'none', documentTitles: [] });
  });

  it('asks Paperless nothing for a page with no linked documents', async () => {
    let asked = 0;
    const counting: DocumentsClient = {
      ...paperless(),
      getPaperlessStatus: () => {
        asked += 1;
        return Promise.resolve({ configured: false, available: false, baseUrl: null });
      },
    };
    const target = harness(counting);
    await apply(target, createItem(randomUUID(), 'Chair'));
    const { items: rows } = await feed(target);
    expect(rows[0]?.documentsStatus).toBe('none');
    expect(asked).toBe(0);
  });

  it('carry provenance only when a purchase fact is recorded', async () => {
    const target = harness();
    const [bought, found] = [randomUUID(), randomUUID()];
    await apply(target, createItem(bought, 'Kettle'), createItem(found, 'Rock'));
    target.db.db
      .update(items)
      .set({ purchasedFromName: 'Kmart', purchasePrice: 29 })
      .where(eq(items.id, bought))
      .run();

    const { items: rows } = await feed(target);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(bought)?.provenance).toEqual({
      merchant: 'Kmart',
      price: 29,
      purchasedOn: null,
      warrantyExpires: null,
      transactionUri: null,
    });
    expect(byId.get(found)?.provenance).toBeNull();
  });

  it('carry the migrated free-text type as legacyType, null when there was none', async () => {
    const target = harness();
    const [migrated, fresh] = [randomUUID(), randomUUID()];
    await apply(target, createItem(migrated, 'Drill'), createItem(fresh, 'Mug'));
    target.db.db.update(items).set({ legacyType: 'Tools' }).where(eq(items.id, migrated)).run();

    const { items: rows } = await feed(target);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(migrated)?.legacyType).toBe('Tools');
    expect(byId.get(fresh)?.legacyType).toBeNull();
  });
});

describe('GET /sync/items/:id/events', () => {
  it('pages an item history newest first', async () => {
    const target = harness();
    const lamp = randomUUID();
    await apply(
      target,
      createItem(lamp, 'Lamp'),
      wireMutation('item.edit', lamp, { name: 'Lamp 2' }, { baseRevision: 1 }),
      wireMutation('item.edit', lamp, { name: 'Lamp 3' }, { baseRevision: 2 })
    );

    const first = await target.api
      .get(`/sync/items/${lamp}/events`)
      .set(PROTOCOL)
      .query({ limit: 2 });
    expect(first.status).toBe(200);
    expect(first.body.events.map((event: SyncEvent) => event.after['name'])).toEqual([
      'Lamp 3',
      'Lamp 2',
    ]);

    const second = await target.api
      .get(`/sync/items/${lamp}/events`)
      .set(PROTOCOL)
      .query({ limit: 2, cursor: first.body.nextCursor });
    expect(second.body.events.map((event: SyncEvent) => event.kind)).toEqual(['created']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('404s an item that never existed', async () => {
    const response = await harness().api.get(`/sync/items/${randomUUID()}/events`).set(PROTOCOL);
    expect(response.status).toBe(404);
  });

  it("400s another item's cursor", async () => {
    const target = harness();
    const [a, b] = [randomUUID(), randomUUID()];
    await apply(
      target,
      createItem(a, 'A'),
      createItem(b, 'B'),
      wireMutation('item.edit', a, { name: 'A2' }, { baseRevision: 1 })
    );
    const page = await target.api.get(`/sync/items/${a}/events`).set(PROTOCOL).query({ limit: 1 });
    const response = await target.api
      .get(`/sync/items/${b}/events`)
      .set(PROTOCOL)
      .query({ cursor: page.body.nextCursor });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'invalid_cursor' });
  });
});
