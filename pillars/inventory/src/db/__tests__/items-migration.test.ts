/**
 * What `0012_items_single_identity` does to a populated database, and what it
 * refuses to do.
 *
 * Shape follows `migration-data-safety.test.ts`: bring a database up to
 * `0011_inventory_source_ref` from a truncated journal, write rows through raw
 * SQL exactly as the pre-ADR-002 schema shaped them, then reopen it with the
 * real opener, which applies 0012 inside drizzle's single transaction with
 * foreign keys on. Every leaf row surviving is the point: a `DROP TABLE
 * home_inventory` issued while a leaf still referenced it would have
 * cascade-deleted them, and nothing else in the suite would notice.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { createTestTransport } from '../../api/__tests__/test-http.js';
import { createInventoryApiApp } from '../../api/app.js';
import { openInventoryDb } from '../open-inventory-db.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

import type { OpenedInventoryDb } from '../open-inventory-db.js';

const BASELINE_TAG = '0011_inventory_source_ref';

const { requestOn } = createTestTransport();
const MIGRATION_ACTOR = '0012_items_single_identity';

let dir: string;
let dbPath: string;

function stageBaseline(seed: (raw: Database.Database) => void): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });
  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });
  seed(raw);
  raw.close();
}

function insertLocation(raw: Database.Database, id: string, name: string, parentId?: string): void {
  raw
    .prepare(
      `INSERT INTO locations (id, name, parent_id, sort_order, last_edited_time)
       VALUES (?, ?, ?, 0, ?)`
    )
    .run(id, name, parentId ?? null, `2026-01-0${id.length % 9}T00:00:00Z`);
}

interface ContainerSeed {
  id: string;
  label: string;
  code?: string | null;
  state: 'open' | 'sealed' | 'moved' | 'unpacked';
  origin?: string | null;
  destination?: string | null;
  notes?: string | null;
}

function insertContainer(raw: Database.Database, c: ContainerSeed): void {
  raw
    .prepare(
      `INSERT INTO containers
         (id, label, code, state, origin_location_id, destination_location_id, notes,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '2026-02-01 10:00:00', '2026-02-03 10:00:00')`
    )
    .run(
      c.id,
      c.label,
      c.code ?? null,
      c.state,
      c.origin ?? null,
      c.destination ?? null,
      c.notes ?? null
    );
}

interface ItemSeed {
  id: string;
  name: string;
  assetId?: string | null;
  locationId?: string | null;
  containerId?: string | null;
  type?: string | null;
}

function insertItem(raw: Database.Database, item: ItemSeed): void {
  raw
    .prepare(
      `INSERT INTO home_inventory
         (id, item_name, asset_id, location_id, container_id, type, last_edited_time,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '2026-01-05T00:00:00Z', '2026-01-04 09:00:00',
               '2026-01-05 09:00:00')`
    )
    .run(
      item.id,
      item.name,
      item.assetId ?? null,
      item.locationId ?? null,
      item.containerId ?? null,
      item.type ?? null
    );
}

function seedPopulated(raw: Database.Database): void {
  insertLocation(raw, 'l-garage', 'Garage');
  insertLocation(raw, 'l-attic', 'Attic');
  insertLocation(raw, 'l-office', 'Office', 'l-attic');

  insertContainer(raw, {
    id: 'c-open',
    label: 'Open box',
    code: 'b412',
    state: 'open',
    origin: 'l-garage',
    notes: 'Kitchen stuff',
  });
  insertContainer(raw, {
    id: 'c-sealed',
    label: 'Sealed box',
    state: 'sealed',
    origin: 'l-garage',
  });
  insertContainer(raw, {
    id: 'c-moved',
    label: 'Moved box',
    state: 'moved',
    origin: 'l-garage',
    destination: 'l-attic',
  });
  insertContainer(raw, {
    id: 'c-unpacked',
    label: 'Unpacked box',
    state: 'unpacked',
    origin: 'l-garage',
    destination: 'l-office',
  });
  insertContainer(raw, { id: 'c-nowhere', label: 'Loose box', state: 'open' });

  insertItem(raw, {
    id: 'i-drill',
    name: 'Cordless drill',
    assetId: 'TV01',
    locationId: 'l-garage',
    type: 'Tools',
  });
  insertItem(raw, {
    id: 'i-hammer',
    name: 'Hammer',
    locationId: 'l-garage',
    containerId: 'c-moved',
  });
  insertItem(raw, { id: 'i-saw', name: 'Saw', locationId: 'l-garage', containerId: 'c-sealed' });
  insertItem(raw, { id: 'i-loose', name: 'Loose screws', assetId: '' });

  raw
    .prepare(
      `UPDATE home_inventory SET
         brand = 'Makita', model = 'DHP', room = 'Garage', location = 'Bench', condition = 'Fair',
         in_use = 1, deductible = 1, purchase_date = '2025-01-01', warranty_expires = '2027-01-01',
         replacement_value = 300, resale_value = 120, purchase_transaction_id = 'tx-9',
         purchase_transaction_uri = 'pops://finance/transaction/tx-9', purchased_from_name = 'Bunnings',
         purchase_price = 249.5, owner_uri = 'pops://core/user/me', source_ref = 'pops://purchases/order/1/item/2',
         notion_id = 'notion-1', notes = 'Keep charged', item_id = 'legacy-7'
       WHERE id = 'i-drill'`
    )
    .run();

  raw
    .prepare(
      `INSERT INTO fixtures (id, name, type, location_id, last_edited_time) VALUES ('f-socket', 'Socket', 'power', 'l-garage', '2026-01-01T00:00:00Z')`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO item_photos (id, item_id, file_path, caption, sort_order) VALUES (11, 'i-drill', 'items/i-drill/photo_001.jpg', 'Front', 1), (12, 'i-drill', 'items/i-drill/photo_002.jpg', NULL, 0), (13, 'i-saw', 'items/i-saw/photo_001.jpg', NULL, 0)`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO item_uploaded_files (id, item_id, file_name, file_path, mime_type, file_size) VALUES (21, 'i-drill', 'manual.pdf', 'items/i-drill/file_001.pdf', 'application/pdf', 1024)`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO item_documents (id, item_id, paperless_document_id, document_type, title) VALUES (31, 'i-drill', 900, 'receipt', 'Receipt'), (32, 'i-hammer', 901, 'warranty', NULL)`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO item_connections (id, item_a_id, item_b_id) VALUES (41, 'i-drill', 'i-saw')`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO item_fixture_connections (id, item_id, fixture_id) VALUES (51, 'i-drill', 'f-socket')`
    )
    .run();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inventory-items-migration-'));
  dbPath = join(dir, 'inventory.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('0012_items_single_identity on a populated database', () => {
  let opened: OpenedInventoryDb;

  beforeEach(() => {
    stageBaseline(seedPopulated);
    opened = openInventoryDb(dbPath);
  });

  afterEach(() => {
    opened.raw.close();
  });

  function all<T>(sql: string, ...params: unknown[]): T[] {
    return opened.raw.prepare(sql).all(...params) as T[];
  }

  function one<T>(sql: string, ...params: unknown[]): T {
    return opened.raw.prepare(sql).get(...params) as T;
  }

  function count(table: string): number {
    return one<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).n;
  }

  it('applies every journal entry and leaves a consistent database', () => {
    expect(count('__drizzle_migrations')).toBe(readMigrationJournal(MIGRATIONS_DIR).length);
    expect(all(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(all(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
    const tables = all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('home_inventory', 'containers')`
    );
    expect(tables).toEqual([]);
    expect(all(`SELECT name FROM sqlite_temp_master WHERE name = 'preflight_0012'`)).toEqual([]);
  });

  it('turns every container and every item into exactly one items row, ids kept', () => {
    const ids = all<{ id: string }>(`SELECT id FROM items ORDER BY id`).map((r) => r.id);
    expect(ids).toEqual([
      'c-moved',
      'c-nowhere',
      'c-open',
      'c-sealed',
      'c-unpacked',
      'i-drill',
      'i-hammer',
      'i-loose',
      'i-saw',
    ]);
  });

  it('keeps every leaf row, pointing at the same item', () => {
    expect(
      all(`SELECT id, item_id, file_path, caption, position FROM item_photos ORDER BY id`)
    ).toEqual([
      {
        id: 11,
        item_id: 'i-drill',
        file_path: 'items/i-drill/photo_001.jpg',
        caption: 'Front',
        position: 1,
      },
      {
        id: 12,
        item_id: 'i-drill',
        file_path: 'items/i-drill/photo_002.jpg',
        caption: null,
        position: 0,
      },
      {
        id: 13,
        item_id: 'i-saw',
        file_path: 'items/i-saw/photo_001.jpg',
        caption: null,
        position: 0,
      },
    ]);
    expect(all(`SELECT id, item_id, file_name FROM item_uploaded_files`)).toEqual([
      { id: 21, item_id: 'i-drill', file_name: 'manual.pdf' },
    ]);
    expect(
      all(`SELECT id, item_id, paperless_document_id FROM item_documents ORDER BY id`)
    ).toEqual([
      { id: 31, item_id: 'i-drill', paperless_document_id: 900 },
      { id: 32, item_id: 'i-hammer', paperless_document_id: 901 },
    ]);
    expect(all(`SELECT id, item_a_id, item_b_id FROM item_connections`)).toEqual([
      { id: 41, item_a_id: 'i-drill', item_b_id: 'i-saw' },
    ]);
    expect(all(`SELECT id, item_id, fixture_id FROM item_fixture_connections`)).toEqual([
      { id: 51, item_id: 'i-drill', fixture_id: 'f-socket' },
    ]);
    expect(one(`SELECT location_id FROM fixtures WHERE id = 'f-socket'`)).toEqual({
      location_id: 'l-garage',
    });
  });

  it('points every rebuilt leaf table at items, cascading on delete', () => {
    for (const table of [
      'item_photos',
      'item_uploaded_files',
      'item_documents',
      'item_connections',
      'item_fixture_connections',
    ]) {
      const refs = all<{ table: string; on_delete: string }>(
        `PRAGMA foreign_key_list(${table})`
      ).filter((fk) => fk.table !== 'fixtures' && fk.table !== 'media');
      expect(refs.length, table).toBeGreaterThan(0);
      for (const fk of refs)
        expect(fk, table).toMatchObject({ table: 'items', on_delete: 'CASCADE' });
    }
  });

  it('places each container where it was moved to, else where it was packed, else in hand', () => {
    const rows = all<{ id: string; placement_kind: string; location_id: string | null }>(
      `SELECT id, placement_kind, location_id FROM items WHERE is_container = 1 ORDER BY id`
    );
    expect(rows).toEqual([
      { id: 'c-moved', placement_kind: 'location', location_id: 'l-attic' },
      { id: 'c-nowhere', placement_kind: 'hand', location_id: null },
      { id: 'c-open', placement_kind: 'location', location_id: 'l-garage' },
      { id: 'c-sealed', placement_kind: 'location', location_id: 'l-garage' },
      { id: 'c-unpacked', placement_kind: 'location', location_id: 'l-office' },
    ]);
  });

  it('types every container storage_box, closes sealed and moved ones, opens the rest', () => {
    const rows = all<{ id: string; type_key: string; access: string; is_full: number | null }>(
      `SELECT i.id, t.key AS type_key, i.access, i.is_full
       FROM items i
       JOIN item_types t ON t.revision = 1 AND t.id = i.type_id
       WHERE i.is_container = 1
       ORDER BY i.id`
    );
    expect(rows).toEqual([
      { id: 'c-moved', type_key: 'storage_box', access: 'closed', is_full: null },
      { id: 'c-nowhere', type_key: 'storage_box', access: 'open', is_full: null },
      { id: 'c-open', type_key: 'storage_box', access: 'open', is_full: null },
      { id: 'c-sealed', type_key: 'storage_box', access: 'closed', is_full: null },
      { id: 'c-unpacked', type_key: 'storage_box', access: 'open', is_full: null },
    ]);
    expect(one(`SELECT name, note, code FROM items WHERE id = 'c-open'`)).toEqual({
      name: 'Open box',
      note: 'Kitchen stuff',
      code: 'b412',
    });
  });

  it('places a contained item in its container alone, and an uncontained one at its location or in hand', () => {
    const rows = all<{
      id: string;
      placement_kind: string;
      location_id: string | null;
      containing_item_id: string | null;
      previous_placement_kind: string | null;
    }>(
      `SELECT id, placement_kind, location_id, containing_item_id, previous_placement_kind
       FROM items WHERE is_container = 0 ORDER BY id`
    );
    expect(rows).toEqual([
      {
        id: 'i-drill',
        placement_kind: 'location',
        location_id: 'l-garage',
        containing_item_id: null,
        previous_placement_kind: null,
      },
      {
        id: 'i-hammer',
        placement_kind: 'container',
        location_id: null,
        containing_item_id: 'c-moved',
        previous_placement_kind: null,
      },
      {
        id: 'i-loose',
        placement_kind: 'hand',
        location_id: null,
        containing_item_id: null,
        previous_placement_kind: null,
      },
      {
        id: 'i-saw',
        placement_kind: 'container',
        location_id: null,
        containing_item_id: 'c-sealed',
        previous_placement_kind: null,
      },
    ]);
  });

  it('leaves items untyped, not containers, with the old type as legacy_type and an empty code as none', () => {
    expect(
      all(
        `SELECT id, type_id, legacy_type, is_container, access, external_ids, code
         FROM items WHERE id IN ('i-drill', 'i-loose') ORDER BY id`
      )
    ).toEqual([
      {
        id: 'i-drill',
        type_id: null,
        legacy_type: 'Tools',
        is_container: 0,
        access: null,
        external_ids: '[]',
        code: 'TV01',
      },
      {
        id: 'i-loose',
        type_id: null,
        legacy_type: null,
        is_container: 0,
        access: null,
        external_ids: '[]',
        code: null,
      },
    ]);
  });

  it('carries the provenance and value columns unchanged, renaming only notes and location', () => {
    expect(one(`SELECT * FROM items WHERE id = 'i-drill'`)).toMatchObject({
      name: 'Cordless drill',
      note: 'Keep charged',
      location_text: 'Bench',
      brand: 'Makita',
      model: 'DHP',
      room: 'Garage',
      item_id: 'legacy-7',
      condition: 'Fair',
      in_use: 1,
      deductible: 1,
      purchase_date: '2025-01-01',
      warranty_expires: '2027-01-01',
      replacement_value: 300,
      resale_value: 120,
      purchase_transaction_id: 'tx-9',
      purchase_transaction_uri: 'pops://finance/transaction/tx-9',
      purchased_from_name: 'Bunnings',
      purchase_price: 249.5,
      owner_uri: 'pops://core/user/me',
      source_ref: 'pops://purchases/order/1/item/2',
      notion_id: 'notion-1',
      last_edited_time: '2026-01-05T00:00:00Z',
      created_at: '2026-01-04 09:00:00',
      updated_at: '2026-01-05 09:00:00',
      deleted_at: null,
    });
  });

  it('starts every item and location at revision 1, quantity 1, active, except a box with history at 2', () => {
    expect(
      all(`SELECT id, revision, quantity, lifecycle FROM items WHERE revision <> 1 ORDER BY id`)
    ).toEqual([
      { id: 'c-moved', revision: 2, quantity: 1, lifecycle: 'active' },
      { id: 'c-sealed', revision: 2, quantity: 1, lifecycle: 'active' },
      { id: 'c-unpacked', revision: 2, quantity: 1, lifecycle: 'active' },
    ]);
    expect(all(`SELECT DISTINCT quantity, lifecycle FROM items`)).toEqual([
      { quantity: 1, lifecycle: 'active' },
    ]);
    expect(all(`SELECT DISTINCT revision FROM locations`)).toEqual([{ revision: 1 }]);
  });

  it('writes a created event at revision 1 and a history event at revision 2, the row being at 2', () => {
    expect(
      all(
        `SELECT e.entity_id, e.kind, e.entity_revision, i.revision AS row_revision
         FROM events e JOIN items i ON i.id = e.entity_id
         WHERE e.entity_id IN ('c-moved', 'c-sealed', 'c-unpacked') ORDER BY e.entity_id, e.seq`
      )
    ).toEqual([
      { entity_id: 'c-moved', kind: 'created', entity_revision: 1, row_revision: 2 },
      { entity_id: 'c-moved', kind: 'moved', entity_revision: 2, row_revision: 2 },
      { entity_id: 'c-sealed', kind: 'created', entity_revision: 1, row_revision: 2 },
      { entity_id: 'c-sealed', kind: 'sealed', entity_revision: 2, row_revision: 2 },
      { entity_id: 'c-unpacked', kind: 'created', entity_revision: 1, row_revision: 2 },
      { entity_id: 'c-unpacked', kind: 'unpacked', entity_revision: 2, row_revision: 2 },
    ]);
  });

  it('writes one created event per item and location, from the migration actor', () => {
    const created = all<{ entity_kind: string; n: number }>(
      `SELECT entity_kind, count(*) AS n FROM events WHERE kind = 'created'
       GROUP BY entity_kind ORDER BY entity_kind`
    );
    expect(created).toEqual([
      { entity_kind: 'item', n: 9 },
      { entity_kind: 'location', n: 3 },
    ]);
    expect(
      all(
        `SELECT DISTINCT actor_kind, actor_id, entity_revision FROM events WHERE kind = 'created'`
      )
    ).toEqual([{ actor_kind: 'migration', actor_id: MIGRATION_ACTOR, entity_revision: 1 }]);
    const drill = one<{ fields: string; after: string; server_time: string }>(
      `SELECT fields, after, server_time FROM events WHERE entity_id = 'i-drill'`
    );
    expect(JSON.parse(drill.after)).toMatchObject({
      name: 'Cordless drill',
      code: 'TV01',
      typeKey: null,
      placement: { kind: 'location', locationId: 'l-garage' },
      isContainer: false,
      access: null,
    });
    expect(JSON.parse(drill.fields)).toContain('placement');
    expect(drill.server_time).toBe('2026-01-04 09:00:00');
  });

  it("keeps a contained item's disagreeing location on its created event, and nothing when it agreed", () => {
    const before = new Map(
      all<{ entity_id: string; before: string }>(
        `SELECT entity_id, before FROM events WHERE entity_id IN ('i-hammer', 'i-saw') AND kind = 'created'`
      ).map((row) => [row.entity_id, JSON.parse(row.before) as unknown])
    );
    expect(before.get('i-hammer')).toEqual({
      placement: { kind: 'location', locationId: 'l-garage' },
    });
    expect(before.get('i-saw')).toEqual({});
  });

  it('turns sealed, moved and unpacked into one history event each, and open into none', () => {
    const history = all<{
      entity_id: string;
      kind: string;
      fields: string;
      before: string;
      after: string;
      server_time: string;
    }>(
      `SELECT entity_id, kind, fields, before, after, server_time FROM events
       WHERE entity_kind = 'item' AND kind <> 'created' ORDER BY entity_id`
    ).map((row) => ({
      ...row,
      fields: JSON.parse(row.fields) as unknown,
      before: JSON.parse(row.before) as unknown,
      after: JSON.parse(row.after) as unknown,
    }));
    expect(history).toEqual([
      {
        entity_id: 'c-moved',
        kind: 'moved',
        fields: ['placement', 'access'],
        before: { placement: { kind: 'location', locationId: 'l-garage' }, access: 'open' },
        after: { placement: { kind: 'location', locationId: 'l-attic' }, access: 'closed' },
        server_time: '2026-02-03 10:00:00',
      },
      {
        entity_id: 'c-sealed',
        kind: 'sealed',
        fields: ['access'],
        before: { access: 'open' },
        after: { access: 'closed' },
        server_time: '2026-02-03 10:00:00',
      },
      {
        entity_id: 'c-unpacked',
        kind: 'unpacked',
        fields: ['access'],
        before: { access: 'closed' },
        after: { access: 'open' },
        server_time: '2026-02-03 10:00:00',
      },
    ]);
  });

  it("records a moved box's created placement as where it was packed, so its history reads as a move", () => {
    const created = one<{ after: string }>(
      `SELECT after FROM events WHERE entity_id = 'c-moved' AND kind = 'created'`
    );
    expect(JSON.parse(created.after)).toMatchObject({
      placement: { kind: 'location', locationId: 'l-garage' },
      access: 'open',
      isContainer: true,
      typeKey: 'storage_box',
    });
  });

  it("sets every row's seq to its latest event, later than its created event for a box with history", () => {
    const mismatched = all(
      `SELECT i.id FROM items i
       WHERE i.seq <> (SELECT max(seq) FROM events e WHERE e.entity_kind = 'item' AND e.entity_id = i.id)
       UNION ALL
       SELECT l.id FROM locations l
       WHERE l.seq <> (SELECT max(seq) FROM events e WHERE e.entity_kind = 'location' AND e.entity_id = l.id)`
    );
    expect(mismatched).toEqual([]);
    const moved = one<{ seq: number; created_seq: number }>(
      `SELECT i.seq, (SELECT seq FROM events WHERE entity_id = 'c-moved' AND kind = 'created') AS created_seq
       FROM items i WHERE i.id = 'c-moved'`
    );
    expect(moved.seq).toBeGreaterThan(moved.created_seq);
  });

  it('backfills location timestamps from last_edited_time and leaves none deleted', () => {
    expect(
      all(
        `SELECT id, created_at = last_edited_time AS c, updated_at = last_edited_time AS u, deleted_at FROM locations ORDER BY id`
      )
    ).toEqual([
      { id: 'l-attic', c: 1, u: 1, deleted_at: null },
      { id: 'l-garage', c: 1, u: 1, deleted_at: null },
      { id: 'l-office', c: 1, u: 1, deleted_at: null },
    ]);
  });

  it('seeds sync_meta with a random epoch and protocol 1', () => {
    const meta = Object.fromEntries(
      all<{ key: string; value: string }>(`SELECT key, value FROM sync_meta`).map((r) => [
        r.key,
        r.value,
      ])
    );
    expect(meta['min_protocol']).toBe('1');
    expect(meta['epoch']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('removes the pre-migration snapshot once the migration commits', () => {
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });
});

describe('0012_items_single_identity on an empty database', () => {
  it('applies cleanly with no rows and no events', () => {
    stageBaseline(() => undefined);
    const opened = openInventoryDb(dbPath);
    try {
      expect(opened.raw.prepare(`SELECT count(*) AS n FROM items`).get()).toEqual({ n: 0 });
      expect(opened.raw.prepare(`SELECT count(*) AS n FROM events`).get()).toEqual({ n: 0 });
    } finally {
      opened.raw.close();
    }
  });
});

describe('0012_items_single_identity on a moved box that went nowhere', () => {
  it('records only the access change, at revision 2, and no placement event', () => {
    stageBaseline((raw) => {
      insertLocation(raw, 'l-garage', 'Garage');
      insertContainer(raw, { id: 'c-stayed', label: 'Stayed', state: 'moved', origin: 'l-garage' });
      insertContainer(raw, {
        id: 'c-same',
        label: 'Same place',
        state: 'moved',
        origin: 'l-garage',
        destination: 'l-garage',
      });
      insertContainer(raw, { id: 'c-limbo', label: 'Nowhere', state: 'moved' });
    });
    const opened = openInventoryDb(dbPath);
    try {
      const history = (
        opened.raw
          .prepare(
            `SELECT entity_id, kind, fields, before, after, entity_revision FROM events
             WHERE entity_kind = 'item' AND kind <> 'created' ORDER BY entity_id`
          )
          .all() as {
          entity_id: string;
          kind: string;
          fields: string;
          before: string;
          after: string;
          entity_revision: number;
        }[]
      ).map((row) => ({
        ...row,
        fields: JSON.parse(row.fields) as unknown,
        before: JSON.parse(row.before) as unknown,
        after: JSON.parse(row.after) as unknown,
      }));
      const accessOnly = {
        kind: 'sealed',
        fields: ['access'],
        before: { access: 'open' },
        after: { access: 'closed' },
        entity_revision: 2,
      };
      expect(history).toEqual([
        { entity_id: 'c-limbo', ...accessOnly },
        { entity_id: 'c-same', ...accessOnly },
        { entity_id: 'c-stayed', ...accessOnly },
      ]);
      expect(
        opened.raw
          .prepare(
            `SELECT id, placement_kind, location_id, access, revision FROM items ORDER BY id`
          )
          .all()
      ).toEqual([
        { id: 'c-limbo', placement_kind: 'hand', location_id: null, access: 'closed', revision: 2 },
        {
          id: 'c-same',
          placement_kind: 'location',
          location_id: 'l-garage',
          access: 'closed',
          revision: 2,
        },
        {
          id: 'c-stayed',
          placement_kind: 'location',
          location_id: 'l-garage',
          access: 'closed',
          revision: 2,
        },
      ]);
    } finally {
      opened.raw.close();
    }
  });
});

describe('0012_items_single_identity on rows pointing at records that do not exist', () => {
  function seedOrphans(raw: Database.Database): void {
    raw.pragma('foreign_keys = OFF');
    insertLocation(raw, 'l-garage', 'Garage');
    insertItem(raw, { id: 'i-ok', name: 'Drill', locationId: 'l-garage' });
    insertItem(raw, { id: 'i-lost', name: 'Kettle', locationId: 'l-gone' });
    insertItem(raw, { id: 'i-boxless', name: 'Saw', containerId: 'c-gone' });
    insertItem(raw, {
      id: 'i-both-gone',
      name: 'Ladder',
      locationId: 'l-gone',
      containerId: 'c-gone',
    });
    insertContainer(raw, { id: 'c-lost', label: 'Lost box', state: 'sealed', origin: 'l-gone' });
    insertContainer(raw, {
      id: 'c-half',
      label: 'Half box',
      state: 'moved',
      origin: 'l-gone',
      destination: 'l-garage',
    });
    raw
      .prepare(
        `INSERT INTO fixtures (id, name, type, location_id, last_edited_time)
         VALUES ('f-socket', 'Socket', 'power', 'l-garage', '2026-01-01T00:00:00Z')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO item_photos (id, item_id, file_path, caption, sort_order, created_at)
         VALUES (11, 'i-ok', 'items/i-ok/p.jpg', NULL, 0, '2026-01-01 00:00:00'),
                (12, 'i-gone', 'items/i-gone/p.jpg', 'Front', 3, '2026-01-02 00:00:00')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO item_uploaded_files (id, item_id, file_name, file_path, mime_type, file_size)
         VALUES (21, 'i-ok', 'a.pdf', 'items/i-ok/a.pdf', 'application/pdf', 1),
                (22, 'i-gone', 'b.pdf', 'items/i-gone/b.pdf', 'application/pdf', 2)`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO item_documents (id, item_id, paperless_document_id, document_type, title)
         VALUES (31, 'i-ok', 900, 'receipt', NULL), (32, 'i-gone', 901, 'warranty', 'W')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO item_connections (id, item_a_id, item_b_id)
         VALUES (41, 'i-lost', 'i-ok'), (42, 'i-gone', 'i-ok')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO item_fixture_connections (id, item_id, fixture_id)
         VALUES (51, 'i-ok', 'f-socket'), (52, 'i-gone', 'f-socket'), (53, 'i-ok', 'f-gone'),
                (54, 'i-gone', 'f-gone')`
      )
      .run();
    raw.pragma('foreign_keys = ON');
  }

  let opened: OpenedInventoryDb;

  beforeEach(() => {
    stageBaseline(seedOrphans);
    opened = openInventoryDb(dbPath);
  });

  afterEach(() => {
    opened.raw.close();
  });

  function all<T>(sql: string): T[] {
    return opened.raw.prepare(sql).all() as T[];
  }

  interface OrphanRow {
    table_name: string;
    row_json: string;
    reason: string;
    captured_at: string;
  }

  function orphans(): {
    table: string;
    id: unknown;
    reason: string;
    row: Record<string, unknown>;
  }[] {
    return all<OrphanRow>(`SELECT * FROM migration_0012_orphans`)
      .map((o) => {
        const row = JSON.parse(o.row_json) as Record<string, unknown>;
        return { table: o.table_name, id: row['id'], reason: o.reason, row };
      })
      .toSorted((a, b) => `${a.table}/${String(a.id)}`.localeCompare(`${b.table}/${String(b.id)}`));
  }

  it('migrates, leaving no dangling reference behind', () => {
    expect(all(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(
      all(`SELECT name FROM sqlite_master WHERE name IN ('home_inventory', 'containers')`)
    ).toEqual([]);
  });

  it('captures every dangling row with the reference it lacks', () => {
    expect(orphans().map(({ table, id, reason }) => ({ table, id, reason }))).toEqual([
      { table: 'containers', id: 'c-half', reason: 'missing location' },
      { table: 'containers', id: 'c-lost', reason: 'missing location' },
      { table: 'home_inventory', id: 'i-both-gone', reason: 'missing location and container' },
      { table: 'home_inventory', id: 'i-boxless', reason: 'missing container' },
      { table: 'home_inventory', id: 'i-lost', reason: 'missing location' },
      { table: 'item_connections', id: 42, reason: 'missing item' },
      { table: 'item_documents', id: 32, reason: 'missing item' },
      { table: 'item_fixture_connections', id: 52, reason: 'missing item' },
      { table: 'item_fixture_connections', id: 53, reason: 'missing fixture' },
      { table: 'item_fixture_connections', id: 54, reason: 'missing item and fixture' },
      { table: 'item_photos', id: 12, reason: 'missing item' },
      { table: 'item_uploaded_files', id: 22, reason: 'missing item' },
    ]);
    for (const o of all<OrphanRow>(`SELECT * FROM migration_0012_orphans`)) {
      expect(new Date(o.captured_at).toISOString()).toBe(o.captured_at);
    }
  });

  it('keeps each captured row whole, original references included', () => {
    const byKey = new Map(orphans().map((o) => [`${o.table}/${String(o.id)}`, o.row]));
    expect(byKey.get('item_photos/12')).toEqual({
      id: 12,
      item_id: 'i-gone',
      file_path: 'items/i-gone/p.jpg',
      caption: 'Front',
      sort_order: 3,
      created_at: '2026-01-02 00:00:00',
    });
    expect(byKey.get('containers/c-half')).toEqual({
      id: 'c-half',
      label: 'Half box',
      code: null,
      state: 'moved',
      origin_location_id: 'l-gone',
      destination_location_id: 'l-garage',
      notes: null,
      created_at: '2026-02-01 10:00:00',
      updated_at: '2026-02-03 10:00:00',
    });
    expect(byKey.get('home_inventory/i-lost')).toMatchObject({
      id: 'i-lost',
      item_name: 'Kettle',
      location_id: 'l-gone',
      container_id: null,
      last_edited_time: '2026-01-05T00:00:00Z',
    });
    expect(Object.keys(byKey.get('home_inventory/i-lost') ?? {})).toHaveLength(32);
    expect(byKey.get('home_inventory/i-boxless')).toMatchObject({ container_id: 'c-gone' });
  });

  it('captures a row missing both its location and its container exactly once, pre-update', () => {
    const dualOrphans = orphans().filter((o) => o.id === 'i-both-gone');
    expect(dualOrphans).toHaveLength(1);
    expect(dualOrphans[0]?.reason).toBe('missing location and container');
    expect(dualOrphans[0]?.row).toMatchObject({
      id: 'i-both-gone',
      item_name: 'Ladder',
      location_id: 'l-gone',
      container_id: 'c-gone',
    });
  });

  it('copies every row whose references exist', () => {
    expect(all(`SELECT id FROM item_photos`)).toEqual([{ id: 11 }]);
    expect(all(`SELECT id FROM item_uploaded_files`)).toEqual([{ id: 21 }]);
    expect(all(`SELECT id FROM item_documents`)).toEqual([{ id: 31 }]);
    expect(all(`SELECT id FROM item_connections`)).toEqual([{ id: 41 }]);
    expect(all(`SELECT id FROM item_fixture_connections`)).toEqual([{ id: 51 }]);
  });

  it('keeps an item or box whose location is gone, in hand with nothing remembered', () => {
    expect(
      all(
        `SELECT id, placement_kind, location_id, containing_item_id, previous_placement_kind,
                previous_location_id, previous_containing_item_id
         FROM items ORDER BY id`
      )
    ).toEqual([
      {
        id: 'c-half',
        placement_kind: 'location',
        location_id: 'l-garage',
        containing_item_id: null,
        previous_placement_kind: null,
        previous_location_id: null,
        previous_containing_item_id: null,
      },
      ...['c-lost', 'i-both-gone', 'i-boxless', 'i-lost'].map((id) => ({
        id,
        placement_kind: 'hand',
        location_id: null,
        containing_item_id: null,
        previous_placement_kind: null,
        previous_location_id: null,
        previous_containing_item_id: null,
      })),
      {
        id: 'i-ok',
        placement_kind: 'location',
        location_id: 'l-garage',
        containing_item_id: null,
        previous_placement_kind: null,
        previous_location_id: null,
        previous_containing_item_id: null,
      },
    ]);
  });

  it('names no missing location in any event', () => {
    expect(
      all(`SELECT seq FROM events WHERE before LIKE '%l-gone%' OR after LIKE '%l-gone%'`)
    ).toEqual([]);
  });

  it('boots: the pillar serves /health from the migrated database', async () => {
    const app = createInventoryApiApp({
      inventoryDb: opened,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
    const res = await requestOn(app).get('/health');
    expect(res.status).toBe(200);
  });
});

/** Every message down an error's `cause` chain: drizzle wraps SQLite's error. */
function errorChainOf(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    const messages: string[] = [];
    for (let current: unknown = err; current instanceof Error; current = current.cause) {
      messages.push(current.message);
    }
    return messages.join('\n');
  }
  throw new Error('expected the call to throw');
}

describe('0012_items_single_identity preflight', () => {
  function expectAbortWithNothingWritten(
    seed: (raw: Database.Database) => void,
    reason: RegExp,
    itemRows = 1
  ): void {
    stageBaseline(seed);
    expect(errorChainOf(() => openInventoryDb(dbPath))).toMatch(reason);

    const raw = new Database(dbPath, { readonly: true });
    try {
      const tables = (
        raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
          name: string;
        }[]
      ).map((row) => row.name);
      expect(tables).toContain('home_inventory');
      expect(tables).toContain('containers');
      expect(tables).not.toContain('items');
      expect(tables).not.toContain('events');
      const journal = readMigrationJournal(MIGRATIONS_DIR);
      const abortingIndex = journal.findIndex(
        (entry) => entry.tag === '0012_items_single_identity'
      );
      expect(raw.prepare(`SELECT count(*) AS n FROM __drizzle_migrations`).get()).toEqual({
        n: abortingIndex,
      });
      expect(raw.prepare(`SELECT count(*) AS n FROM home_inventory`).get()).toEqual({
        n: itemRows,
      });
    } finally {
      raw.close();
    }
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toHaveLength(1);
  }

  it('aborts on an asset id and a box code that differ only in case', () => {
    expectAbortWithNothingWritten((raw) => {
      insertContainer(raw, { id: 'c-1', label: 'Box', code: 'b412', state: 'open' });
      insertItem(raw, { id: 'i-1', name: 'Kettle', assetId: 'B412' });
    }, /preflight_0012_code_collision/);
  });

  it('aborts on two asset ids that differ only in case', () => {
    expectAbortWithNothingWritten(
      (raw) => {
        insertItem(raw, { id: 'i-1', name: 'Kettle', assetId: 'tv01' });
        insertItem(raw, { id: 'i-2', name: 'Toaster', assetId: 'TV01' });
      },
      /preflight_0012_code_collision/,
      2
    );
  });

  it('aborts on an id held by both a box and an item', () => {
    expectAbortWithNothingWritten((raw) => {
      insertContainer(raw, { id: 'same-id', label: 'Box', state: 'open' });
      insertItem(raw, { id: 'same-id', name: 'Kettle' });
    }, /preflight_0012_id_collision/);
  });

  it('does not treat empty codes as a collision', () => {
    stageBaseline((raw) => {
      insertContainer(raw, { id: 'c-1', label: 'Box', code: '', state: 'open' });
      insertItem(raw, { id: 'i-1', name: 'Kettle', assetId: '' });
    });
    const opened = openInventoryDb(dbPath);
    try {
      expect(opened.raw.prepare(`SELECT id, code FROM items ORDER BY id`).all()).toEqual([
        { id: 'c-1', code: null },
        { id: 'i-1', code: null },
      ]);
    } finally {
      opened.raw.close();
    }
  });
});
