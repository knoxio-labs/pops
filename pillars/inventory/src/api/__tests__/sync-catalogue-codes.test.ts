/**
 * `GET /types` (the catalogue descriptor and its ETag) and
 * `POST /codes/suggest` (deterministic stem-and-number suggestions).
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { items, settings } from '../../db/index.js';
import { createItem, openSyncHarness, PROTOCOL, send, type SyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let h: SyncHarness;

beforeEach(() => {
  h = openSyncHarness(transport);
});
afterEach(() => h.close());

describe('GET /types', () => {
  it('serves the projected catalogue with its version as the ETag', async () => {
    const response = await h.api.get('/types').set(PROTOCOL);

    expect(response.status).toBe(200);
    expect(response.headers['etag']).toBe(`"${response.body.version}"`);
    expect(response.body.types.map((type: { key: string }) => type.key)).toEqual([
      'book',
      'bulb',
      'cable',
      'charger',
      'furniture',
      'storage_box',
      'tape',
    ]);
    const box = response.body.types.find((type: { key: string }) => type.key === 'storage_box');
    expect(box.capabilities).toEqual(['containment']);
  });

  it('answers 304 to a matching If-None-Match and 200 to a stale one', async () => {
    const { version } = (await h.api.get('/types').set(PROTOCOL)).body;
    const fresh = await h.api.get('/types').set({ ...PROTOCOL, 'If-None-Match': `"${version}"` });
    const stale = await h.api.get('/types').set({ ...PROTOCOL, 'If-None-Match': '"older"' });
    expect(fresh.status).toBe(304);
    expect(stale.status).toBe(200);
  });
});

async function suggest(body: Record<string, string>): Promise<string[]> {
  const response = await h.api.post('/codes/suggest').set(PROTOCOL).send(body);
  expect(response.status).toBe(200);
  return response.body.suggestions as string[];
}

async function itemWithCode(code: string, typeKey?: string): Promise<string> {
  const id = randomUUID();
  const create = createItem(id, `Item ${code}`);
  if (typeKey) create.args = { item: { name: `Item ${code}`, typeKey } };
  const response = await send(h.api, [create]);
  expect(response.body.outcomes[0].status).toBe('applied');
  h.db.db.update(items).set({ code }).where(eq(items.id, id)).run();
  return id;
}

describe('POST /codes/suggest', () => {
  it('numbers from the highest code with the stem, keeping its width, case-insensitively', async () => {
    await itemWithCode('B0411');
    await itemWithCode('b0412');
    await itemWithCode('BX900');
    expect(await suggest({ name: 'Box', stem: 'B' })).toEqual(['B0413', 'B0414', 'B0415']);
  });

  it('steps over a code a tombstoned item still holds', async () => {
    const gone = await itemWithCode('K007');
    h.db.db
      .update(items)
      .set({ deletedAt: '2026-09-19T00:00:00.000Z' })
      .where(eq(items.id, gone))
      .run();
    expect(await suggest({ name: 'Kettle', stem: 'K' })).toEqual(['K008', 'K009', 'K010']);
  });

  it('starts at 001 for a stem nobody uses', async () => {
    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q001', 'Q002', 'Q003']);
  });

  it("numbers after the highest code the type's pattern matches", async () => {
    await itemWithCode('CRATE12', 'storage_box');
    await itemWithCode('CRATE15', 'storage_box');
    await itemWithCode('S3', 'storage_box');
    expect(await suggest({ name: 'Moving box', typeKey: 'storage_box' })).toEqual([
      'S04',
      'S05',
      'S06',
    ]);
  });

  it('uses the type letter, and X when untyped or the type is unknown', async () => {
    expect((await suggest({ name: 'Moving box', typeKey: 'storage_box' }))[0]).toBe('S01');
    expect((await suggest({ name: 'lamp' }))[0]).toBe('X01');
    expect((await suggest({ name: '42', typeKey: 'not_a_type' }))[0]).toBe('X01');
  });

  it('returns no suggestions when the setting is off', async () => {
    h.db.db.insert(settings).values({ key: 'inventory.suggestCodes', value: 'false' }).run();

    expect(await suggest({ name: 'Anything' })).toEqual([]);
  });

  it('uses a stored pattern width and suffix', async () => {
    h.db.db.insert(settings).values({ key: 'inventory.codePattern', value: 'B{###}-A' }).run();

    expect(await suggest({ name: 'Box' })).toEqual(['B001-A', 'B002-A', 'B003-A']);
  });

  it('falls back to the default pattern when the stored pattern is invalid', async () => {
    h.db.db.insert(settings).values({ key: 'inventory.codePattern', value: '{type}-{room}' }).run();

    expect(await suggest({ name: 'Box', typeKey: 'storage_box' })).toEqual(['S01', 'S02', 'S03']);
  });

  it('refuses a stem ending in a digit, which would make the numbering ambiguous', async () => {
    const response = await h.api
      .post('/codes/suggest')
      .set(PROTOCOL)
      .send({ name: 'Box', stem: 'B4' });
    expect(response.status).toBe(400);
  });
});
