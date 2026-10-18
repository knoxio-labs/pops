import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCatalogueDraft } from '../../catalogue/authoring.js';
import {
  WebPlacementSourcesResponseSchema,
  WebTypeArrivalCountsResponseSchema,
} from '../../contract/rest-web.js';
import { catalogueRevisions, items, itemTypes } from '../../db/index.js';
import { encodeCursor } from '../sync/cursor.js';
import { readWebItemsPage } from '../web/items-page.js';
import { readWebPlacementSources } from '../web/placement-sources.js';
import { readWebTypeArrivalCounts } from '../web/type-arrival-counts.js';
import { openSyncHarness, type SyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { ItemInsert } from '../../db/index.js';

const transport = createTestTransport();
let harness: SyncHarness;

beforeEach(() => {
  harness = openSyncHarness(transport);
});

afterEach(() => {
  vi.restoreAllMocks();
  harness.close();
});

function insertItem(id: string, overrides: Partial<ItemInsert> = {}): void {
  harness.db.db
    .insert(items)
    .values({
      id,
      name: `Item ${id}`,
      seq: 1,
      placementKind: 'hand',
      lastEditedTime: '2026-10-18T00:00:00.000Z',
      ...overrides,
    })
    .run();
}

function firstTypes() {
  const types = harness.db.db.select().from(itemTypes).where(eq(itemTypes.revision, 1)).all();
  const first = types[0];
  const second = types[1];
  if (first === undefined || second === undefined) throw new Error('expected bootstrap types');
  return { first, second };
}

function draftRevision(): number {
  return createCatalogueDraft(harness.db.db, 1, {
    kind: 'web',
    id: 'supporting-reads-test',
    label: 'Test',
  }).revision.revision;
}

function publishFixture(revision: number): void {
  harness.db.db
    .update(catalogueRevisions)
    .set({ status: 'published', publishedAt: '2026-10-18T00:00:00.000Z' })
    .where(eq(catalogueRevisions.revision, revision))
    .run();
}

describe('lightweight placement sources', () => {
  it('pages only live active containers of both access states without hydration', async () => {
    const { first } = firstTypes();
    insertItem('a', { isContainer: 1, access: 'open', typeId: first.id, note: 'Open box' });
    insertItem('b', {
      isContainer: 1,
      access: 'closed',
      isFull: 1,
      placementKind: 'container',
      containingItemId: 'a',
    });
    insertItem('c', { isContainer: 1, access: 'open', lifecycle: 'retired' });
    insertItem('d', {
      isContainer: 1,
      access: 'closed',
      deletedAt: '2026-10-18T00:00:00.000Z',
    });
    insertItem('e');

    const firstResponse = await harness.api.get('/web/placement-sources?limit=1');
    expect(firstResponse.status).toBe(200);
    const page = WebPlacementSourcesResponseSchema.parse(firstResponse.body);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: 'a',
      typeKey: first.key,
      typeId: first.id,
      note: 'Open box',
      placement: { kind: 'hand' },
      access: 'open',
    });
    expect(Object.keys(firstResponse.body).toSorted()).toEqual(['items', 'nextCursor']);
    expect(Object.keys(page.items[0] ?? {}).toSorted()).toEqual(
      [
        'id',
        'name',
        'typeId',
        'typeKey',
        'legacyType',
        'note',
        'code',
        'quantity',
        'lifecycle',
        'placement',
        'previousPlacement',
        'isContainer',
        'access',
        'isFull',
        'updatedAt',
      ].toSorted()
    );
    expect(page.nextCursor).not.toBeNull();
    const nextResponse = await harness.api
      .get('/web/placement-sources')
      .query({ cursor: page.nextCursor, limit: 1 });
    expect(nextResponse.status).toBe(200);
    const next = WebPlacementSourcesResponseSchema.parse(nextResponse.body);
    expect(next.items).toHaveLength(1);
    expect(next.items[0]).toMatchObject({
      id: 'b',
      placement: { kind: 'container', itemId: 'a' },
      access: 'closed',
      isFull: true,
    });
    expect(next.nextCursor).toBeNull();
  });

  it('keeps item and metadata queries constant as the page grows', () => {
    const { first } = firstTypes();
    for (let index = 0; index < 200; index += 1) {
      insertItem(String(index).padStart(3, '0'), {
        isContainer: 1,
        access: 'open',
        typeId: first.id,
      });
    }
    const queries = vi.spyOn(harness.db.raw, 'prepare');
    expect(readWebPlacementSources(harness.db.db, { limit: 1 }).items).toHaveLength(1);
    const smallCount = queries.mock.calls.length;
    queries.mockClear();
    expect(readWebPlacementSources(harness.db.db, { limit: 200 }).items).toHaveLength(200);
    expect(queries.mock.calls).toHaveLength(smallCount);
    expect(smallCount).toBe(2);
    expect(queries.mock.calls.map(([query]) => query).join('\n')).not.toMatch(
      /item_field_values|item_photos|item_documents|count\(/iu
    );
  });

  it('does not repeat earlier rows after an insertion before the cursor', () => {
    insertItem('b', { isContainer: 1, access: 'open' });
    insertItem('c', { isContainer: 1, access: 'closed' });
    const page = readWebPlacementSources(harness.db.db, { limit: 1 });
    if (page.nextCursor === null) throw new Error('expected next cursor');
    insertItem('a', { isContainer: 1, access: 'open' });
    expect(
      readWebPlacementSources(harness.db.db, { limit: 1, cursor: page.nextCursor })
    ).toMatchObject({ items: [{ id: 'c' }], nextCursor: null });
  });

  it.each(['0', '201', '1.5', 'nope'])('rejects limit %s', async (limit) => {
    expect((await harness.api.get('/web/placement-sources').query({ limit })).status).toBe(400);
  });

  it.each(['garbage', encodeCursor({ v: 1, t: 'web-items', after: 'a' })])(
    'rejects a malformed or foreign cursor',
    async (cursor) => {
      expect((await harness.api.get('/web/placement-sources').query({ cursor })).status).toBe(400);
    }
  );

  it('returns an empty final page when no containers exist', async () => {
    const response = await harness.api.get('/web/placement-sources');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });
});

describe('consolidated type-arrival counts', () => {
  it('matches list semantics for duplicate, shared and normalized labels and excluded rows', async () => {
    const { first, second } = firstTypes();
    const revision = draftRevision();
    for (const [type, labels] of [
      [first, [' Tool ', 'tool', 'Shared', '']],
      [second, ['SHARED']],
    ] as const) {
      harness.db.db
        .update(itemTypes)
        .set({ legacyLabelsJson: JSON.stringify(labels) })
        .where(and(eq(itemTypes.revision, revision), eq(itemTypes.id, type.id)))
        .run();
    }
    publishFixture(revision);
    insertItem('a', { legacyType: ' TOOL ' });
    insertItem('b', { legacyType: 'shared' });
    insertItem('c', { legacyType: 'Tool', lifecycle: 'retired' });
    insertItem('d', { legacyType: 'Tool', deletedAt: '2026-10-18T00:00:00.000Z' });
    insertItem('e', { legacyType: 'Tool', typeId: first.id });
    insertItem('f', { legacyType: null });
    insertItem('g', { legacyType: '' });
    insertItem('h', { legacyType: '\tTool\t' });

    const response = await harness.api.get('/web/type-arrival-counts');
    expect(response.status).toBe(200);
    const { counts } = WebTypeArrivalCountsResponseSchema.parse(response.body);
    expect(counts[first.key]).toBe(2);
    expect(counts[second.key]).toBe(1);
    expect(counts['missing-type']).toBeUndefined();
    for (const type of [first, second]) {
      expect(counts[type.key]).toBe(
        readWebItemsPage(harness.db.db, { legacyLabelOf: type.key, untyped: true }, { limit: 1 })
          .total
      );
    }
  });

  it('keeps queries constant as the published type count grows', () => {
    const { first } = firstTypes();
    const queries = vi.spyOn(harness.db.raw, 'prepare');
    const before = readWebTypeArrivalCounts(harness.db.db);
    const smallCount = queries.mock.calls.length;
    queries.mockRestore();
    const revision = draftRevision();
    for (let index = 0; index < 100; index += 1) {
      harness.db.db
        .insert(itemTypes)
        .values({
          ...first,
          revision,
          id: randomUUID(),
          key: `new-type-${index}`,
          legacyLabelsJson: JSON.stringify(['shared']),
        })
        .run();
    }
    publishFixture(revision);
    const largerQueries = vi.spyOn(harness.db.raw, 'prepare');
    const after = readWebTypeArrivalCounts(harness.db.db);
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length + 100);
    expect(largerQueries.mock.calls).toHaveLength(smallCount);
    expect(smallCount).toBe(5);
    expect(largerQueries.mock.calls.filter(([query]) => /count\(\*\)/iu.test(query))).toHaveLength(
      1
    );
  });
});
