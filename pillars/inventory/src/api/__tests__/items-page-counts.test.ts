import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { items, itemTypes, openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { MAX_CONTAINMENT_DEPTH } from '../../domain/commands/index.js';
import { readWebItemsPage } from '../web/items-page.js';

let inventory: OpenedInventoryDb;
let queries: string[];
let db: OpenedInventoryDb['db'];

beforeEach(() => {
  inventory = openInventoryDb(':memory:');
  queries = [];
  db = drizzle(inventory.raw, { logger: { logQuery: (query) => queries.push(query) } });
});

afterEach(() => {
  inventory.raw.close();
});

function addItem(id: string, overrides: Partial<typeof items.$inferInsert> = {}): void {
  db.insert(items)
    .values({
      id,
      name: id,
      placementKind: 'hand',
      lastEditedTime: '2026-10-18',
      seq: 1,
      ...overrides,
    })
    .run();
}

function addContainer(id: string, overrides: Partial<typeof items.$inferInsert> = {}): void {
  addItem(id, { isContainer: 1, access: 'open', ...overrides });
}

function childOf(
  containingItemId: string
): Pick<typeof items.$inferInsert, 'placementKind' | 'containingItemId'> {
  return { placementKind: 'container', containingItemId };
}

describe('web item page count queries', () => {
  it('uses one current totals query and skips recursive counts for an empty or non-container page', () => {
    queries.length = 0;
    expect(readWebItemsPage(db, {}, { limit: 10 })).toMatchObject({
      rows: [],
      total: 0,
      unfilteredTotal: 0,
      hiddenInactiveCount: 0,
      contentCounts: {},
    });
    expect(queries).toHaveLength(2);
    addItem('plain');
    queries.length = 0;
    expect(readWebItemsPage(db, {}, { limit: 10 }).contentCounts).toEqual({});
    expect(queries).toHaveLength(2);
    expect(queries.filter((query) => /count\(/iu.test(query))).toHaveLength(1);
  });

  it('shares container predicates across totals while applying text, ids and lifecycle only to their intended counts', () => {
    addContainer('Needle active', { isFull: 0 });
    addContainer('Needle retired', { isFull: 0, lifecycle: 'retired' });
    addContainer('Needle deleted', { isFull: 0, deletedAt: '2026-10-18' });
    addContainer('Other active', { isFull: 0 });
    addContainer('Needle closed', { isFull: 0, access: 'closed' });
    addContainer('Needle full', { isFull: 1 });
    addItem('Needle plain');
    const filter = { q: 'Needle', isContainer: true, access: 'open', isFull: false } as const;
    queries.length = 0;
    const page = readWebItemsPage(db, filter, { limit: 10 });
    expect(page.rows.map((row) => row.id)).toEqual(['Needle active']);
    expect(page).toMatchObject({ total: 1, unfilteredTotal: 2, hiddenInactiveCount: 1 });
    expect(queries).toHaveLength(3);
    expect(readWebItemsPage(db, { ...filter, includeInactive: true }, { limit: 10 })).toMatchObject(
      {
        total: 2,
        unfilteredTotal: 3,
        hiddenInactiveCount: 0,
      }
    );
    expect(
      readWebItemsPage(
        db,
        { ...filter, lifecycle: 'retired', includeInactive: true },
        { limit: 10 }
      )
    ).toMatchObject({
      total: 1,
      unfilteredTotal: 1,
      hiddenInactiveCount: 0,
    });
    expect(readWebItemsPage(db, { ...filter, ids: [] }, { limit: 10 })).toMatchObject({
      total: 0,
      unfilteredTotal: 2,
      hiddenInactiveCount: 0,
    });
  });

  it('resolves a published type filter once for active and hidden counts', () => {
    const type = db.select().from(itemTypes).get();
    if (!type) throw new Error('published fixture type is missing');
    addItem('active', { typeId: type.id });
    addItem('retired', { typeId: type.id, lifecycle: 'retired' });
    addItem('other');
    queries.length = 0;
    expect(readWebItemsPage(db, { typeKey: type.key.toUpperCase() }, { limit: 10 })).toMatchObject({
      total: 1,
      unfilteredTotal: 2,
      hiddenInactiveCount: 1,
    });
    expect(queries.filter((query) => query.includes('from "catalogue_revisions"'))).toHaveLength(1);
    expect(queries).toHaveLength(6);
  });

  it('resolves combined type and legacy-label filters from the same catalogue snapshot', () => {
    const type = db.select().from(itemTypes).get();
    if (!type) throw new Error('published fixture type is missing');
    addItem('untyped', { legacyType: 'anything' });
    queries.length = 0;
    expect(
      readWebItemsPage(db, { typeKey: type.key, legacyLabelOf: type.key }, { limit: 10 })
    ).toMatchObject({
      total: 0,
      unfilteredTotal: 1,
      hiddenInactiveCount: 0,
    });
    expect(queries.filter((query) => query.includes('from "catalogue_revisions"'))).toHaveLength(1);
    expect(queries).toHaveLength(6);
  });

  it('counts nested active contents through inactive and deleted containers and resolves within once', () => {
    addContainer('outer');
    addContainer('retired', { ...childOf('outer'), lifecycle: 'retired' });
    addContainer('deleted', { ...childOf('outer'), deletedAt: '2026-10-18' });
    addItem('under-retired', childOf('retired'));
    addItem('under-deleted', childOf('deleted'));
    addItem('direct', childOf('outer'));
    addItem('hidden', { ...childOf('retired'), lifecycle: 'lost' });
    addContainer('empty');
    queries.length = 0;
    const within = readWebItemsPage(db, { within: 'outer' }, { limit: 20 });
    expect(new Set(within.rows.map((row) => row.id))).toEqual(
      new Set(['under-retired', 'under-deleted', 'direct'])
    );
    expect(within).toMatchObject({ total: 3, unfilteredTotal: 5, hiddenInactiveCount: 2 });
    expect(queries).toHaveLength(4);
    expect(
      readWebItemsPage(
        db,
        { ids: ['outer', 'retired', 'empty'], includeInactive: true },
        { limit: 20 }
      ).contentCounts
    ).toEqual({
      outer: { direct: 1, deep: 3 },
      retired: { direct: 1, deep: 1 },
      empty: { direct: 0, deep: 0 },
    });
  });

  it('recomputes totals after inserts and lifecycle changes between cursor pages', () => {
    addItem('alpha');
    addItem('bravo');
    addItem('charlie');
    const first = readWebItemsPage(db, {}, { limit: 1, sort: 'name' });
    if (!first.nextCursor) throw new Error('first page did not issue a cursor');
    addItem('aardvark');
    db.update(items).set({ lifecycle: 'retired' }).where(eq(items.id, 'charlie')).run();
    addItem('delta');
    const next = readWebItemsPage(db, {}, { cursor: first.nextCursor, limit: 1, sort: 'name' });
    expect(next.rows.map((row) => row.id)).toEqual(['bravo']);
    expect(next).toMatchObject({ total: 4, unfilteredTotal: 4, hiddenInactiveCount: 1 });
    expect(first).toMatchObject({ total: 3, unfilteredTotal: 3, hiddenInactiveCount: 0 });
    expect(readWebItemsPage(db, { ids: ['absent'] }, { limit: 10 })).toMatchObject({
      total: 0,
      unfilteredTotal: 4,
      hiddenInactiveCount: 0,
    });
  });

  it('retains bounded recursive counts for deeply nested contents', () => {
    addContainer('root');
    for (let depth = 1; depth <= MAX_CONTAINMENT_DEPTH + 1; depth += 1) {
      addContainer(`level-${depth}`, childOf(depth === 1 ? 'root' : `level-${depth - 1}`));
    }
    expect(readWebItemsPage(db, { ids: ['root'] }, { limit: 1 }).contentCounts).toEqual({
      root: { direct: 1, deep: MAX_CONTAINMENT_DEPTH },
    });
  });
});
