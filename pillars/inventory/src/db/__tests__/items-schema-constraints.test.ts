/**
 * The invariants ADR-002 puts in the schema rather than in code: each CHECK
 * refuses its illegal combination, `events` is append-only, and the foreign
 * keys on placement refuse what a tombstone-first design must never do
 * silently. Each case starts from a row that is accepted, so a rejection is
 * the constraint under test and not a malformed fixture.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { openMigratedTestDb } from './migrated-db.js';

import type Database from 'better-sqlite3';

let raw: Database.Database;

beforeEach(() => {
  raw = openMigratedTestDb().raw;
  raw
    .prepare(
      `INSERT INTO locations (id, name, sort_order, last_edited_time) VALUES ('l-1', 'Shelf', 0, 'now')`
    )
    .run();
  insertItem({ id: 'box', is_container: 1, access: 'open' });
});

type Row = Record<string, string | number | null>;

const BASE_ITEM: Row = {
  name: 'Thing',
  placement_kind: 'hand',
  last_edited_time: '2026-09-18T00:00:00.000Z',
  seq: 0,
};

function insertItem(overrides: Row): void {
  const row = { id: 'item', ...BASE_ITEM, ...overrides };
  const columns = Object.keys(row);
  raw
    .prepare(
      `INSERT INTO items (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    )
    .run(...Object.values(row));
}

function insertEvent(overrides: Row = {}): void {
  const row: Row = {
    entity_kind: 'item',
    entity_id: 'box',
    kind: 'created',
    fields: '[]',
    before: '{}',
    after: '{}',
    entity_revision: 1,
    actor_kind: 'web',
    server_time: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
  const columns = Object.keys(row);
  raw
    .prepare(
      `INSERT INTO events (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    )
    .run(...Object.values(row));
}

describe('items CHECK constraints', () => {
  it.each<[string, Row]>([
    ['in hand with nothing set', {}],
    ['at a location', { placement_kind: 'location', location_id: 'l-1' }],
    ['in a container', { placement_kind: 'container', containing_item_id: 'box' }],
    [
      'in hand remembering a place',
      { previous_placement_kind: 'location', previous_location_id: 'gone' },
    ],
    [
      'in hand remembering a box',
      { previous_placement_kind: 'container', previous_containing_item_id: 'gone' },
    ],
    ['a closed, full container', { is_container: 1, access: 'closed', is_full: 1 }],
    ['every lifecycle but active', { lifecycle: 'destroyed', quantity: 9999 }],
  ])('accepts %s', (_label, overrides) => {
    expect(() => insertItem(overrides)).not.toThrow();
  });

  it.each<[string, Row, string]>([
    [
      'a location placement without a location',
      { placement_kind: 'location' },
      'ck_items_placement',
    ],
    [
      'a location placement that is also contained',
      { placement_kind: 'location', location_id: 'l-1', containing_item_id: 'box' },
      'ck_items_placement',
    ],
    [
      'a container placement without a container',
      { placement_kind: 'container' },
      'ck_items_placement',
    ],
    [
      'a container placement that also has a location',
      { placement_kind: 'container', containing_item_id: 'box', location_id: 'l-1' },
      'ck_items_placement',
    ],
    ['in hand with a location', { location_id: 'l-1' }, 'ck_items_placement'],
    ['an unknown placement kind', { placement_kind: 'floor' }, 'ck_items_placement'],
    [
      'a previous placement while placed',
      {
        placement_kind: 'location',
        location_id: 'l-1',
        previous_placement_kind: 'location',
        previous_location_id: 'old',
      },
      'ck_items_previous_placement',
    ],
    [
      'a previous place kind without its id',
      { previous_placement_kind: 'location' },
      'ck_items_previous_placement',
    ],
    [
      'a previous place with both ids',
      {
        previous_placement_kind: 'container',
        previous_containing_item_id: 'a',
        previous_location_id: 'b',
      },
      'ck_items_previous_placement',
    ],
    ['a previous id with no kind', { previous_location_id: 'old' }, 'ck_items_previous_placement'],
    ['a zero quantity', { quantity: 0 }, 'ck_items_quantity'],
    ['an unknown lifecycle', { lifecycle: 'gone' }, 'ck_items_lifecycle'],
    ['a non-boolean is_container', { is_container: 2, access: 'open' }, 'ck_items_is_container'],
    ['access on a non-container', { access: 'open' }, 'ck_items_access'],
    ['a container without access', { is_container: 1 }, 'ck_items_access'],
    ['an unknown access state', { is_container: 1, access: 'sealed' }, 'ck_items_access'],
    ['fullness on a non-container', { is_full: 0 }, 'ck_items_is_full'],
    ['non-array external ids', { external_ids: '{}' }, 'ck_items_external_ids'],
    ['a zero revision', { revision: 0 }, 'ck_items_revision'],
  ])('refuses %s', (_label, overrides, constraint) => {
    expect(() => insertItem(overrides)).toThrow(`CHECK constraint failed: ${constraint}`);
  });

  it('refuses an item that contains itself', () => {
    expect(() =>
      insertItem({
        id: 'self',
        is_container: 1,
        access: 'open',
        placement_kind: 'container',
        containing_item_id: 'self',
      })
    ).toThrow('CHECK constraint failed: ck_items_not_self_contained');
  });

  it('refuses a code already held in another case', () => {
    insertItem({ id: 'a', code: 'B412' });
    expect(() => insertItem({ id: 'b', code: 'b412' })).toThrow(/UNIQUE constraint failed/);
    expect(() => insertItem({ id: 'c', code: null })).not.toThrow();
    expect(() => insertItem({ id: 'd', code: null })).not.toThrow();
  });

  it('requires seq to be decided by the writer', () => {
    expect(() =>
      raw
        .prepare(
          `INSERT INTO items (id, name, placement_kind, last_edited_time) VALUES ('x', 'X', 'hand', 'now')`
        )
        .run()
    ).toThrow(/NOT NULL constraint failed: items.seq/);
  });
});

describe('items foreign keys', () => {
  it('refuses a location or container that does not exist', () => {
    expect(() => insertItem({ placement_kind: 'location', location_id: 'nope' })).toThrow(
      /FOREIGN KEY/
    );
    expect(() => insertItem({ placement_kind: 'container', containing_item_id: 'nope' })).toThrow(
      /FOREIGN KEY/
    );
  });

  it('refuses to delete a container that still holds something, or a place that still has items', () => {
    insertItem({ placement_kind: 'container', containing_item_id: 'box' });
    insertItem({ id: 'shelved', placement_kind: 'location', location_id: 'l-1' });

    expect(() => raw.prepare(`DELETE FROM items WHERE id = 'box'`).run()).toThrow(/FOREIGN KEY/);
    expect(() => raw.prepare(`DELETE FROM locations WHERE id = 'l-1'`).run()).toThrow(
      /FOREIGN KEY/
    );
  });

  it('cascades an item deletion into its leaf rows', () => {
    insertItem({});
    raw.prepare(`INSERT INTO item_photos (item_id, file_path) VALUES ('item', 'a.jpg')`).run();
    raw
      .prepare(
        `INSERT INTO item_documents (item_id, paperless_document_id, document_type) VALUES ('item', 1, 'receipt')`
      )
      .run();

    raw.prepare(`DELETE FROM items WHERE id = 'item'`).run();

    expect(raw.prepare(`SELECT count(*) AS n FROM item_photos`).get()).toEqual({ n: 0 });
    expect(raw.prepare(`SELECT count(*) AS n FROM item_documents`).get()).toEqual({ n: 0 });
  });
});

describe('events', () => {
  it('accepts an append', () => {
    expect(() => insertEvent()).not.toThrow();
  });

  it('refuses every update and delete', () => {
    insertEvent();
    expect(() => raw.prepare(`UPDATE events SET reason = 'x'`).run()).toThrow(
      'events is append-only'
    );
    expect(() => raw.prepare(`DELETE FROM events`).run()).toThrow('events is append-only');
    expect(raw.prepare(`SELECT count(*) AS n FROM events`).get()).toEqual({ n: 1 });
  });

  it('numbers appends in commit order', () => {
    insertEvent();
    insertEvent();
    expect(raw.prepare(`SELECT seq FROM events ORDER BY seq`).all()).toEqual([
      { seq: 1 },
      { seq: 2 },
    ]);
  });

  it.each<[string, Row, string]>([
    ['an unknown entity kind', { entity_kind: 'fixture' }, 'ck_events_entity_kind'],
    ['an unknown actor kind', { actor_kind: 'robot' }, 'ck_events_actor_kind'],
    ['non-array fields', { fields: '{}' }, 'ck_events_fields'],
    ['non-object before', { before: '[]' }, 'ck_events_before'],
    ['non-object after', { after: 'null' }, 'ck_events_after'],
    ['a zero entity revision', { entity_revision: 0 }, 'ck_events_entity_revision'],
  ])('refuses %s', (_label, overrides, constraint) => {
    expect(() => insertEvent(overrides)).toThrow(`CHECK constraint failed: ${constraint}`);
  });

  it('refuses to compensate an event that does not exist', () => {
    expect(() => insertEvent({ kind: 'reverted', compensates_seq: 99 })).toThrow(/FOREIGN KEY/);
  });
});

describe('catalogue snapshot immutability', () => {
  beforeEach(() => {
    raw
      .prepare(
        `INSERT INTO catalogue_revisions
           (revision, base_revision, status, minimum_protocol, created_actor_kind, created_at)
         VALUES (2, 1, 'draft', 1, 'migration', 'now')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO item_types
           (revision, id, key, label, sort_order, capabilities_json, legacy_labels_json, presentation_json)
         VALUES (2, 'draft-type', 'draft_type', 'Draft type', 0, '[]', '[]', '{}')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO item_type_fields
           (revision, id, type_id, key, label, sort_order, kind, cardinality, required,
            storage, reference_kinds_json, reference_type_ids_json, allow_override,
            presentation_json)
         VALUES (2, 'draft-field', 'draft-type', 'State', 'State', 0, 'enum', 'one', 0,
                 'stored', '[]', '[]', 0, '{}')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO field_enum_options
           (revision, id, field_id, key, label, sort_order)
         VALUES (2, 'draft-option', 'draft-field', 'ready', 'Ready', 0)`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO catalogue_compatibility
           (from_revision, to_revision, classification, affected_ids_json)
         VALUES (1, 2, 'compatible', '[]')`
      )
      .run();
  });

  it.each([
    ['type', `UPDATE item_types SET revision = 1 WHERE id = 'draft-type'`],
    ['field', `UPDATE item_type_fields SET revision = 1 WHERE id = 'draft-field'`],
    ['option', `UPDATE field_enum_options SET revision = 1 WHERE id = 'draft-option'`],
    [
      'compatibility proof',
      `UPDATE catalogue_compatibility SET to_revision = 1 WHERE to_revision = 2`,
    ],
  ])('refuses moving a draft %s into a published snapshot', (_label, statement) => {
    expect(() => raw.prepare(statement).run()).toThrow(/terminal catalogue/);
  });
});

describe('mutations, media and item_photos', () => {
  const HASH = 'a'.repeat(64);

  it('stores only decided outcomes', () => {
    const insert = raw.prepare(
      `INSERT INTO mutations (mutation_id, actor_id, op, entity_id, status, outcome, received_at)
       VALUES (?, 'dev', 'item.move', 'item', ?, '{}', 'now')`
    );
    expect(() => insert.run('m-1', 'applied')).not.toThrow();
    expect(() => insert.run('m-2', 'deferred')).toThrow(
      'CHECK constraint failed: ck_mutations_status'
    );
  });

  it('accepts only a lowercase hex SHA-256 as a media key', () => {
    const insert = raw.prepare(
      `INSERT INTO media (sha256, mime, byte_size, stored_at) VALUES (?, 'image/jpeg', 1, 'now')`
    );
    expect(() => insert.run(HASH)).not.toThrow();
    expect(() => insert.run('A'.repeat(64))).toThrow('CHECK constraint failed: ck_media_sha256');
    expect(() => insert.run('a'.repeat(63))).toThrow('CHECK constraint failed: ck_media_sha256');
    expect(() => insert.run(`${'a'.repeat(63)}g`)).toThrow(
      'CHECK constraint failed: ck_media_sha256'
    );
  });

  it('requires a photo to have bytes by hash or by file, and the hash to be stored', () => {
    insertItem({});
    const insert = raw.prepare(
      `INSERT INTO item_photos (item_id, media_sha256, file_path) VALUES ('item', ?, ?)`
    );
    expect(() => insert.run(null, null)).toThrow('CHECK constraint failed: ck_item_photos_source');
    expect(() => insert.run(HASH, null)).toThrow(/FOREIGN KEY/);
    raw
      .prepare(
        `INSERT INTO media (sha256, mime, byte_size, stored_at) VALUES (?, 'image/jpeg', 1, 'now')`
      )
      .run(HASH);
    expect(() => insert.run(HASH, null)).not.toThrow();
  });
});
