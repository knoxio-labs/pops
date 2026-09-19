/**
 * `GET /types` (the catalogue descriptor and its ETag) and
 * `POST /codes/suggest` (deterministic stem-and-number suggestions).
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { items } from '../../db/index.js';
import { INVENTORY_TYPES, projectCatalogue } from '../../types/index.js';
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
    const expected = projectCatalogue(INVENTORY_TYPES);
    const response = await h.api.get('/types').set(PROTOCOL);

    expect(response.status).toBe(200);
    expect(response.headers['etag']).toBe(`"${expected.version}"`);
    expect(response.body.version).toBe(expected.version);
    expect(response.body.types.map((type: { key: string }) => type.key)).toEqual(
      expected.types.map((type) => type.key)
    );
    const box = response.body.types.find((type: { key: string }) => type.key === 'storage_box');
    expect(box.capabilities).toEqual(['containment']);
  });

  it('answers 304 to a matching If-None-Match and 200 to a stale one', async () => {
    const { version } = projectCatalogue(INVENTORY_TYPES);
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

  it("uses the stem the type's items share before falling back to letters", async () => {
    await itemWithCode('CRATE12', 'storage_box');
    await itemWithCode('CRATE15', 'storage_box');
    await itemWithCode('S3', 'storage_box');
    expect(await suggest({ name: 'Moving box', typeKey: 'storage_box' })).toEqual([
      'CRATE016',
      'CRATE017',
      'CRATE018',
    ]);
  });

  it("falls back to the type name's first letter, then the item name's", async () => {
    expect((await suggest({ name: 'Moving box', typeKey: 'storage_box' }))[0]).toBe('S001');
    expect((await suggest({ name: 'lamp' }))[0]).toBe('L001');
    expect((await suggest({ name: '42', typeKey: 'not_a_type' }))[0]).toBe('X001');
  });

  it('refuses a stem ending in a digit, which would make the numbering ambiguous', async () => {
    const response = await h.api
      .post('/codes/suggest')
      .set(PROTOCOL)
      .send({ name: 'Box', stem: 'B4' });
    expect(response.status).toBe(400);
  });
});
