/**
 * `POST /codes/suggest` without a stem continues the code families the
 * item's type already uses, with and without a model answer. The saved
 * pattern answers only when the type has no family.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { items } from '../../db/index.js';
import {
  createItem,
  createLocation,
  openSyncHarness,
  PROTOCOL,
  send,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { AiClient } from '../ai/client.js';

const transport = createTestTransport();
let h: SyncHarness;

function withModel(suggestCodes: AiClient['suggestCodes'] = async () => undefined): void {
  h = openSyncHarness(transport, { ai: { suggestCodes } });
}

afterEach(() => h.close());

async function suggest(body: Record<string, string>): Promise<string[]> {
  const response = await h.api.post('/codes/suggest').set(PROTOCOL).send(body);
  expect(response.status).toBe(200);
  return response.body.suggestions as string[];
}

async function location(name: string, parentId: string | null = null): Promise<string> {
  const id = randomUUID();
  const response = await send(h.api, [createLocation(id, name, parentId)]);
  expect(response.body.outcomes[0].status).toBe('applied');
  return id;
}

async function coded(
  code: string,
  typeKey: string,
  fields: Partial<typeof items.$inferInsert> = {}
): Promise<string> {
  const id = randomUUID();
  const create = createItem(id, `Item ${code}`);
  create.args = { item: { name: `Item ${code}`, typeKey } };
  const response = await send(h.api, [create]);
  expect(response.body.outcomes[0].status).toBe('applied');
  h.db.db
    .update(items)
    .set({ code, ...fields })
    .where(eq(items.id, id))
    .run();
  return id;
}

function at(locationId: string): Partial<typeof items.$inferInsert> {
  return { placementKind: 'location', locationId };
}

function inside(containingItemId: string): Partial<typeof items.$inferInsert> {
  return { placementKind: 'container', containingItemId };
}

async function rooms(): Promise<{ home: string; office: string; kitchen: string; pantry: string }> {
  const home = await location('Home');
  return {
    home,
    office: await location('Office', home),
    kitchen: await location('Kitchen', home),
    pantry: await location('Pantry', home),
  };
}

describe('POST /codes/suggest — family fallback', () => {
  it("continues the destination room's box family over a larger one elsewhere", async () => {
    withModel();
    const { office, kitchen, pantry } = await rooms();
    for (const n of [1, 2, 3, 4]) await coded(`BOX-OFFICE-${n}`, 'storage_box', at(office));
    for (const n of [1, 2, 3, 4, 5, 6]) await coded(`BOX-KITCHEN-${n}`, 'storage_box', at(kitchen));
    await coded('BOX-PANTRY-1', 'storage_box', at(pantry));

    expect(
      await suggest({
        name: 'SodaStream syrups + cushion',
        typeKey: 'storage_box',
        locationId: office,
      })
    ).toEqual(['BOX-OFFICE-5', 'BOX-OFFICE-6', 'BOX-OFFICE-7']);
  });

  it('matches a room through a sub-location', async () => {
    withModel();
    const { office, kitchen } = await rooms();
    const desk = await location('Desk', office);
    await coded('BOX-OFFICE-1', 'storage_box', at(office));
    for (const n of [1, 2]) await coded(`BOX-KITCHEN-${n}`, 'storage_box', at(kitchen));

    expect((await suggest({ name: 'Cables', typeKey: 'storage_box', locationId: desk }))[0]).toBe(
      'BOX-OFFICE-2'
    );
  });

  it("continues the type's family wherever its members are when the destination shares none", async () => {
    withModel();
    const { office, pantry } = await rooms();
    const box = await coded('BOX-PANTRY-1', 'storage_box', at(pantry));
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) await coded(`BK-NOVEL-${n}`, 'book', at(office));
    await coded('BK-COOK-1', 'book', at(pantry));

    expect(await suggest({ name: 'The Hobbit', typeKey: 'book', containerId: box })).toEqual([
      'BK-COOK-2',
      'BK-COOK-3',
      'BK-COOK-4',
    ]);
    expect(await suggest({ name: 'The Hobbit', typeKey: 'book' })).toEqual([
      'BK-NOVEL-9',
      'BK-NOVEL-10',
      'BK-NOVEL-11',
    ]);
  });

  it('prefers the family already inside the destination container', async () => {
    withModel();
    const { office } = await rooms();
    const shelf = await coded('SHELF-1', 'furniture', {
      ...at(office),
      isContainer: 1,
      access: 'open',
    });
    await coded('BK-REF-1', 'book', inside(shelf));
    for (const n of [1, 2, 3]) await coded(`BK-NOVEL-${n}`, 'book', at(office));

    expect((await suggest({ name: 'Atlas', typeKey: 'book', containerId: shelf }))[0]).toBe(
      'BK-REF-2'
    );
  });

  it('keeps a family zero-padded when it is, and steps over a tombstoned code', async () => {
    withModel();
    await coded('BK-007', 'book');
    await coded('BK-008', 'book', { deletedAt: '2026-10-01T00:00:00.000Z' });

    expect(await suggest({ name: 'Dune', typeKey: 'book' })).toEqual([
      'BK-009',
      'BK-010',
      'BK-011',
    ]);
  });

  it('uses the configured pattern when the type has no coded item', async () => {
    withModel();
    await coded('BK-NOVEL-1', 'book');
    await coded('BOX-OLD-1', 'storage_box', { deletedAt: '2026-10-01T00:00:00.000Z' });

    expect(await suggest({ name: 'Moving box', typeKey: 'storage_box' })).toEqual([
      'S01',
      'S02',
      'S03',
    ]);
    expect(await suggest({ name: 'Lamp', typeKey: 'not_a_type' })).toEqual(['L01', 'L02', 'L03']);
    expect(await suggest({ name: 'Lamp' })).toEqual(['L01', 'L02', 'L03']);
  });

  it("keeps the pattern's width when the best family is the pattern's own prefix", async () => {
    withModel();
    await coded('S3', 'storage_box');

    expect(await suggest({ name: 'Moving box', typeKey: 'storage_box' })).toEqual([
      'S04',
      'S05',
      'S06',
    ]);
  });

  it('lets a stem override the inferred family', async () => {
    withModel();
    const { office } = await rooms();
    await coded('BOX-OFFICE-4', 'storage_box', at(office));

    expect(
      await suggest({
        name: 'Box',
        typeKey: 'storage_box',
        locationId: office,
        stem: 'BOX-PANTRY-',
      })
    ).toEqual(['BOX-PANTRY-001', 'BOX-PANTRY-002', 'BOX-PANTRY-003']);
  });
});

describe('POST /codes/suggest — model codes that continue a family', () => {
  it("offers a model code continuing one of the type's families, despite the saved pattern", async () => {
    withModel(async () => ['BOX-OFFICE-5', 'BOX-PANTRY-2', 'S01']);
    const { office, pantry } = await rooms();
    await coded('BOX-OFFICE-4', 'storage_box', at(office));
    await coded('BOX-PANTRY-1', 'storage_box', at(pantry));

    expect(await suggest({ name: 'Syrups', typeKey: 'storage_box', locationId: office })).toEqual([
      'BOX-OFFICE-5',
      'BOX-PANTRY-2',
      'S01',
    ]);
  });

  it("drops a model code from another type's family or an invented one", async () => {
    withModel(async () => ['BK-NOVEL-2', 'CRATE-1', 'BOX-OFFICE-2']);
    await coded('BK-NOVEL-1', 'book');
    await coded('BOX-OFFICE-1', 'storage_box');

    expect(await suggest({ name: 'Syrups', typeKey: 'storage_box' })).toEqual(['BOX-OFFICE-2']);
  });
});
