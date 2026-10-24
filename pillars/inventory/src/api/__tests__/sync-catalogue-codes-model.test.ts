/**
 * `POST /codes/suggest` with a stub `ai` client standing in for the model.
 * Whatever the model proposes is filtered to codes that are actually free;
 * deterministic numbering (`sync-catalogue-codes.test.ts`) answers whenever
 * nothing usable is left.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { items, settings } from '../../db/index.js';
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
import type { CodeSuggestionContext } from '../sync/code-context.js';

const transport = createTestTransport();
let h: SyncHarness;

function withModel(suggestCodes: AiClient['suggestCodes']): void {
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

async function item(
  name: string,
  fields: Partial<typeof items.$inferInsert> = {},
  typeKey?: string
): Promise<string> {
  const id = randomUUID();
  const create = createItem(id, name);
  if (typeKey) create.args = { item: { name, typeKey } };
  const response = await send(h.api, [create]);
  expect(response.body.outcomes[0].status).toBe('applied');
  if (Object.keys(fields).length > 0) {
    h.db.db.update(items).set(fields).where(eq(items.id, id)).run();
  }
  return id;
}

describe('POST /codes/suggest — model suggestions', () => {
  it('offers the model codes, dropping held, repeated and over-long ones', async () => {
    withModel(async () => ['o04', 'O05', 'o05', 'X'.repeat(65), 'O06']);
    await item('Office 4', { code: 'O04' });

    expect(await suggest({ name: 'Office 5' })).toEqual(['O05', 'O06']);
  });

  it('drops a code a tombstoned item still holds', async () => {
    withModel(async () => ['K07', 'K08']);
    await item('Old kettle', { code: 'K07', deletedAt: '2026-09-19T00:00:00.000Z' });

    expect(await suggest({ name: 'Kettle' })).toEqual(['K08']);
  });

  it('drops codes that ignore the stem the owner typed', async () => {
    withModel(async () => ['BOX-9', 'BK-3']);

    expect(await suggest({ name: 'Novel', stem: 'BK-' })).toEqual(['BK-3']);
  });

  it('shows the model every code with its item, type and place, and the destination', async () => {
    const seen = vi.fn<AiClient['suggestCodes']>(async () => ['BOX-OFFICE-5']);
    withModel(seen);
    const home = await location('Home');
    const office = await location('Office', home);
    const shelves = await item('Shelves', {
      code: 'SHELVES-1',
      isContainer: 1,
      access: 'open',
      placementKind: 'location',
      locationId: office,
    });
    await item(
      'Office 4',
      { code: 'BOX-OFFICE-4', placementKind: 'container', containingItemId: shelves },
      'storage_box'
    );
    await item('No code here');

    await suggest({ name: 'Office 5', typeKey: 'storage_box', containerId: shelves });

    const [context, count] = seen.mock.calls[0] ?? [];
    expect(count).toBe(3);
    expect(context).toEqual<CodeSuggestionContext>({
      item: { name: 'Office 5', typeKey: 'storage_box', typeLabel: expect.any(String) },
      destination: { path: ['Home', 'Office'], container: { name: 'Shelves', code: 'SHELVES-1' } },
      existing: expect.arrayContaining([
        { code: 'SHELVES-1', name: 'Shelves', place: 'Home > Office' },
        {
          code: 'BOX-OFFICE-4',
          name: 'Office 4',
          typeKey: 'storage_box',
          place: 'Home > Office > Shelves',
        },
      ]),
    });
    expect(context?.existing).toHaveLength(2);
  });

  it('describes a location destination by its full path', async () => {
    const seen = vi.fn<AiClient['suggestCodes']>(async () => ['R01']);
    withModel(seen);
    const home = await location('Home');
    const pantry = await location('Pantry', home);

    await suggest({ name: 'Rice', locationId: pantry });

    expect(seen.mock.calls[0]?.[0].destination).toEqual({ path: ['Home', 'Pantry'] });
  });

  it('ignores a destination it cannot find rather than refusing', async () => {
    const seen = vi.fn<AiClient['suggestCodes']>(async () => ['R01']);
    withModel(seen);

    expect(await suggest({ name: 'Rice', locationId: 'gone', containerId: 'gone' })).toEqual([
      'R01',
    ]);
    expect(seen.mock.calls[0]?.[0].destination).toBeUndefined();
  });

  it('offers model codes whatever the saved pattern says', async () => {
    withModel(async () => ['BOX-OFFICE-5', 'crate 7', 'S007-OTHER']);
    h.db.db
      .insert(settings)
      .values({ key: 'inventory.codePattern', value: '{type}{###}-END' })
      .run();

    expect(await suggest({ name: 'Moving box', typeKey: 'storage_box' })).toEqual([
      'BOX-OFFICE-5',
      'crate 7',
      'S007-OTHER',
    ]);
  });

  it('keeps only model codes starting with a typed stem', async () => {
    withModel(async () => ['B001-END', 'BK-SCIENCE-1', 'bk-8']);
    h.db.db.insert(settings).values({ key: 'inventory.codePattern', value: 'B{###}-END' }).run();

    expect(await suggest({ name: 'Box', stem: 'BK-' })).toEqual(['BK-SCIENCE-1', 'bk-8']);
  });
});

describe('POST /codes/suggest — deterministic fallback', () => {
  it('numbers deterministically when the model has no answer', async () => {
    withModel(async () => undefined);

    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q001', 'Q002', 'Q003']);
  });

  it('numbers deterministically when the ai client throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    withModel(() => Promise.reject(new Error('boom')));

    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q001', 'Q002', 'Q003']);
    error.mockRestore();
  });

  it('numbers deterministically when every model code is held', async () => {
    withModel(async () => ['Q001']);
    await item('Held', { code: 'Q001' });

    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q002', 'Q003', 'Q004']);
  });

  it('never asks the model when suggestions are disabled', async () => {
    const suggestCodes = vi.fn<AiClient['suggestCodes']>(async () => ['A-1']);
    withModel(suggestCodes);
    h.db.db.insert(settings).values({ key: 'inventory.suggestCodes', value: 'false' }).run();

    expect(await suggest({ name: 'Anything' })).toEqual([]);
    expect(suggestCodes).not.toHaveBeenCalled();
  });
});
