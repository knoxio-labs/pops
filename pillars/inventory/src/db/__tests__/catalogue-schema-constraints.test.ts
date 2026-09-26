/**
 * POPS-4356: the SQL-level invariants declared in `db/schema/catalogue.ts` and
 * `db/schema/catalogue-history.ts` (migrations 0017-0021) that no test yet
 * exercises directly: uniqueness within a revision, JSON shape checks, the
 * one-open-draft rule, the append-only and terminal-immutability triggers, and
 * the stored/computed field shape. `ck_item_types_replaced_by` and
 * `ck_item_type_fields_replaced_by` are covered by
 * `catalogue-replacement-lineage-migration.test.ts`, and
 * `ck_catalogue_revisions_draft_version` by
 * `catalogue-draft-version-migration.test.ts`; both are left there rather
 * than duplicated here.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { openMigratedTestDb } from './migrated-db.js';

import type Database from 'better-sqlite3';

let raw: Database.Database;

beforeEach(() => {
  raw = openMigratedTestDb().raw;
});

type Row = Record<string, string | number | null>;

function insertRow(table: string, row: Row): void {
  const columns = Object.keys(row);
  raw
    .prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    )
    .run(...Object.values(row));
}

const BASE_REVISION: Row = {
  revision: 2,
  base_revision: 1,
  status: 'draft',
  minimum_protocol: 1,
  created_actor_kind: 'web',
  created_at: 'now',
};

function insertRevision(overrides: Row = {}): void {
  insertRow('catalogue_revisions', { ...BASE_REVISION, ...overrides });
}

function abandonRevision(revision: number): void {
  raw
    .prepare(
      `UPDATE catalogue_revisions
         SET status = 'abandoned', abandoned_at = 'now', abandoned_actor_kind = 'web'
       WHERE revision = ?`
    )
    .run(revision);
}

const BASE_TYPE: Row = {
  revision: 2,
  id: 'type-1',
  key: 'gadget',
  label: 'Gadget',
  sort_order: 0,
  capabilities_json: '[]',
  legacy_labels_json: '[]',
  presentation_json: '{}',
};

function insertType(overrides: Row = {}): void {
  insertRow('item_types', { ...BASE_TYPE, ...overrides });
}

const BASE_FIELD: Row = {
  revision: 2,
  id: 'field-1',
  type_id: 'type-1',
  key: 'Colour',
  label: 'Colour',
  sort_order: 0,
  kind: 'short_text',
  cardinality: 'one',
  required: 0,
  storage: 'stored',
  reference_kinds_json: '[]',
  reference_type_ids_json: '[]',
  allow_override: 0,
  presentation_json: '{}',
};

function insertField(overrides: Row = {}): void {
  insertRow('item_type_fields', { ...BASE_FIELD, ...overrides });
}

const BASE_OPTION: Row = {
  revision: 2,
  id: 'option-1',
  field_id: 'field-1',
  key: 'red',
  label: 'Red',
  sort_order: 0,
};

function insertOption(overrides: Row = {}): void {
  insertRow('field_enum_options', { ...BASE_OPTION, ...overrides });
}

describe('catalogue_revisions', () => {
  it('accepts a well-formed draft', () => {
    expect(() => insertRevision()).not.toThrow();
  });

  it.each<[string, Row, string]>([
    ['an unknown status', { status: 'pending' }, 'ck_catalogue_revisions_status'],
    ['a zero minimum protocol', { minimum_protocol: 0 }, 'ck_catalogue_revisions_minimum_protocol'],
    [
      'a draft carrying a publication date',
      { published_at: 'now' },
      'ck_catalogue_revisions_terminal_state',
    ],
    [
      'a draft carrying an abandonment date',
      { abandoned_at: 'now' },
      'ck_catalogue_revisions_terminal_state',
    ],
    [
      'a published revision with no publication date',
      { status: 'published' },
      'ck_catalogue_revisions_terminal_state',
    ],
    [
      'a published revision that is also abandoned',
      { status: 'published', published_at: 'now', abandoned_at: 'now' },
      'ck_catalogue_revisions_terminal_state',
    ],
    [
      'an abandoned revision with no abandonment date',
      { status: 'abandoned' },
      'ck_catalogue_revisions_terminal_state',
    ],
  ])('refuses %s', (_label, overrides, constraint) => {
    expect(() => insertRevision(overrides)).toThrow(`CHECK constraint failed: ${constraint}`);
  });

  it('refuses a base revision that does not exist', () => {
    expect(() => insertRevision({ base_revision: 999 })).toThrow(/FOREIGN KEY/);
  });

  it('refuses a second open draft while one is already open', () => {
    insertRevision();
    expect(() => insertRevision({ revision: 3 })).toThrow(/UNIQUE constraint failed/);
  });

  it('allows a new draft once the previous one is no longer open', () => {
    insertRevision();
    abandonRevision(2);
    expect(() => insertRevision({ revision: 3, base_revision: 1 })).not.toThrow();
  });

  it('refuses updating or deleting a terminal (published) revision', () => {
    expect(() =>
      raw.prepare(`UPDATE catalogue_revisions SET publication_note = 'x' WHERE revision = 1`).run()
    ).toThrow(/terminal catalogue revision is immutable/);
    expect(() => raw.prepare(`DELETE FROM catalogue_revisions WHERE revision = 1`).run()).toThrow(
      /terminal catalogue revision is immutable/
    );
  });

  it('refuses updating or deleting a terminal (abandoned) revision', () => {
    insertRevision();
    abandonRevision(2);
    expect(() =>
      raw.prepare(`UPDATE catalogue_revisions SET publication_note = 'x' WHERE revision = 2`).run()
    ).toThrow(/terminal catalogue revision is immutable/);
    expect(() => raw.prepare(`DELETE FROM catalogue_revisions WHERE revision = 2`).run()).toThrow(
      /terminal catalogue revision is immutable/
    );
  });
});

describe('catalogue_compatibility', () => {
  const BASE_COMPAT: Row = {
    from_revision: 1,
    to_revision: 2,
    classification: 'compatible',
    affected_ids_json: '[]',
  };

  function insertCompat(overrides: Row = {}): void {
    insertRow('catalogue_compatibility', { ...BASE_COMPAT, ...overrides });
  }

  beforeEach(() => {
    insertRevision();
    // A third, non-draft revision, so "wrong order" can be tested without the
    // non-draft-target trigger pre-empting the CHECK under test.
    insertRevision({
      revision: 3,
      base_revision: 2,
      status: 'abandoned',
      abandoned_at: 'now',
      abandoned_actor_kind: 'web',
    });
  });

  it('accepts a proof from an earlier revision to the open draft', () => {
    expect(() => insertCompat()).not.toThrow();
  });

  it.each<[string, Row, string]>([
    [
      'a non-array affected-ids payload',
      { affected_ids_json: '{}' },
      'ck_catalogue_compatibility_affected_ids_json',
    ],
    [
      'revisions in the wrong order',
      { from_revision: 3, to_revision: 2 },
      'ck_catalogue_compatibility_order',
    ],
    ['equal revisions', { from_revision: 2, to_revision: 2 }, 'ck_catalogue_compatibility_order'],
  ])('refuses %s', (_label, overrides, constraint) => {
    expect(() => insertCompat(overrides)).toThrow(`CHECK constraint failed: ${constraint}`);
  });

  it('refuses an unknown revision on either side', () => {
    expect(() => insertCompat({ from_revision: 0 })).toThrow(/FOREIGN KEY/);
    expect(() => insertCompat({ to_revision: 999 })).toThrow(/FOREIGN KEY/);
  });

  it('refuses recording the same pair twice', () => {
    insertCompat();
    expect(() => insertCompat()).toThrow(/UNIQUE constraint failed/);
  });

  it('refuses inserting a proof once its target revision is no longer a draft', () => {
    abandonRevision(2);
    expect(() => insertCompat()).toThrow(/terminal catalogue compatibility is immutable/);
  });

  it('refuses deleting a proof once its target revision is no longer a draft', () => {
    insertCompat();
    abandonRevision(2);
    expect(() =>
      raw
        .prepare(`DELETE FROM catalogue_compatibility WHERE from_revision = 1 AND to_revision = 2`)
        .run()
    ).toThrow(/terminal catalogue compatibility is immutable/);
  });
});

describe('catalogue_events', () => {
  const BASE_EVENT: Row = {
    revision: 1,
    kind: 'published',
    actor_kind: 'web',
    before_json: '{}',
    after_json: '{}',
    server_time: 'now',
  };

  function insertEvent(overrides: Row = {}): void {
    insertRow('catalogue_events', { ...BASE_EVENT, ...overrides });
  }

  it('accepts an append', () => {
    expect(() => insertEvent()).not.toThrow();
  });

  it.each<[string, Row, string]>([
    ['a non-object before payload', { before_json: '[]' }, 'ck_catalogue_events_before_json'],
    ['a non-object after payload', { after_json: 'null' }, 'ck_catalogue_events_after_json'],
    [
      'a negative affected-items count',
      { affected_items: -1 },
      'ck_catalogue_events_affected_items',
    ],
  ])('refuses %s', (_label, overrides, constraint) => {
    expect(() => insertEvent(overrides)).toThrow(`CHECK constraint failed: ${constraint}`);
  });

  it('refuses an event against an unknown revision', () => {
    expect(() => insertEvent({ revision: 999 })).toThrow(/FOREIGN KEY/);
  });

  it('refuses every update and delete', () => {
    insertEvent();
    expect(() => raw.prepare(`UPDATE catalogue_events SET kind = 'draft_created'`).run()).toThrow(
      'catalogue events are append-only'
    );
    expect(() => raw.prepare(`DELETE FROM catalogue_events`).run()).toThrow(
      'catalogue events are append-only'
    );
  });
});

describe('item_types', () => {
  beforeEach(() => {
    insertRevision();
  });

  it('accepts a well-formed type', () => {
    expect(() => insertType()).not.toThrow();
  });

  it.each<[string, Row, string]>([
    ['a negative sort order', { sort_order: -1 }, 'ck_item_types_sort_order'],
    ['non-array capabilities', { capabilities_json: '{}' }, 'ck_item_types_capabilities_json'],
    [
      'invalid JSON capabilities',
      { capabilities_json: 'not-json' },
      'ck_item_types_capabilities_json',
    ],
    ['non-array legacy labels', { legacy_labels_json: '{}' }, 'ck_item_types_legacy_labels_json'],
    ['non-object presentation', { presentation_json: '[]' }, 'ck_item_types_presentation_json'],
  ])('refuses %s', (_label, overrides, constraint) => {
    expect(() => insertType(overrides)).toThrow(`CHECK constraint failed: ${constraint}`);
  });

  it('refuses a key already used in the same revision, case-insensitively', () => {
    insertType();
    expect(() => insertType({ id: 'type-2', key: 'GADGET' })).toThrow(/UNIQUE constraint failed/);
    expect(() => insertType({ id: 'type-2', key: 'widget' })).not.toThrow();
  });

  it('allows the same key across different revisions', () => {
    insertType();
    abandonRevision(2);
    insertRevision({ revision: 3, base_revision: 2 });
    expect(() => insertType({ revision: 3 })).not.toThrow();
  });

  it('refuses a type in an unknown revision', () => {
    expect(() => insertType({ revision: 999 })).toThrow(/FOREIGN KEY/);
  });

  it('refuses a duplicate id within the same revision', () => {
    insertType();
    expect(() => insertType({ key: 'other' })).toThrow(/UNIQUE constraint failed/);
  });
});

describe('item_type_fields', () => {
  beforeEach(() => {
    insertRevision();
    insertType();
  });

  it('accepts a well-formed stored field', () => {
    expect(() => insertField()).not.toThrow();
  });

  it('stores no default unless one is given, and accepts an array default', () => {
    insertField();
    insertField({ id: 'field-2', key: 'Size', default_values_json: '["M"]' });
    expect(
      raw
        .prepare(
          'SELECT id, default_values_json FROM item_type_fields WHERE revision = 2 ORDER BY id'
        )
        .all()
    ).toEqual([
      { id: 'field-1', default_values_json: '[]' },
      { id: 'field-2', default_values_json: '["M"]' },
    ]);
  });

  it('refuses a null default', () => {
    expect(() => insertField({ default_values_json: null })).toThrow(/NOT NULL constraint failed/);
  });

  it('accepts a well-formed computed field', () => {
    expect(() =>
      insertField({
        id: 'field-2',
        key: 'Total',
        storage: 'computed',
        expression_version: 1,
        expression_json: '{"op":"literal","value":1}',
        allow_override: 1,
      })
    ).not.toThrow();
  });

  it.each<[string, Row, string]>([
    ['an unknown kind', { kind: 'paragraph' }, 'ck_item_type_fields_kind'],
    ['a negative sort order', { sort_order: -1 }, 'ck_item_type_fields_sort_order'],
    ['an unknown cardinality', { cardinality: 'few' }, 'ck_item_type_fields_cardinality'],
    [
      'a many-valued boolean',
      { kind: 'boolean', cardinality: 'many' },
      'ck_item_type_fields_boolean_cardinality',
    ],
    ['a non-boolean required flag', { required: 2 }, 'ck_item_type_fields_required'],
    ['an unknown storage mode', { storage: 'cached' }, 'ck_item_type_fields_storage'],
    [
      'a non-boolean allow_override flag',
      { allow_override: 2 },
      'ck_item_type_fields_allow_override',
    ],
    [
      'non-array reference kinds',
      { reference_kinds_json: '{}' },
      'ck_item_type_fields_reference_kinds_json',
    ],
    [
      'non-array reference type ids',
      { reference_type_ids_json: '{}' },
      'ck_item_type_fields_reference_type_ids_json',
    ],
    [
      'non-object presentation',
      { presentation_json: '[]' },
      'ck_item_type_fields_presentation_json',
    ],
    [
      'a non-array default',
      { default_values_json: '"M"' },
      'ck_item_type_fields_default_values_json',
    ],
    ['an object default', { default_values_json: '{}' }, 'ck_item_type_fields_default_values_json'],
    [
      'invalid JSON in a default',
      { default_values_json: 'not-json' },
      'ck_item_type_fields_default_values_json',
    ],
    [
      'invalid JSON in a computed expression',
      {
        storage: 'computed',
        expression_version: 1,
        expression_json: 'not-json',
        allow_override: 1,
      },
      'ck_item_type_fields_expression_json',
    ],
    [
      'a stored field carrying an expression',
      { expression_version: 1, expression_json: '{}' },
      'ck_item_type_fields_storage_shape',
    ],
    [
      'a stored field allowing override',
      { allow_override: 1 },
      'ck_item_type_fields_storage_shape',
    ],
    [
      'a computed field missing its expression',
      { storage: 'computed' },
      'ck_item_type_fields_storage_shape',
    ],
    [
      'a computed field missing its expression version',
      { storage: 'computed', expression_json: '{}' },
      'ck_item_type_fields_storage_shape',
    ],
  ])('refuses %s', (_label, overrides, constraint) => {
    expect(() => insertField(overrides)).toThrow(`CHECK constraint failed: ${constraint}`);
  });

  it('refuses a key already used on the same type in the same revision, case-insensitively', () => {
    insertField();
    expect(() => insertField({ id: 'field-2', key: 'COLOUR' })).toThrow(/UNIQUE constraint failed/);
  });

  it('allows the same key on a different type', () => {
    insertType({ id: 'type-2', key: 'widget' });
    insertField();
    expect(() => insertField({ id: 'field-2', type_id: 'type-2' })).not.toThrow();
  });

  it('refuses a field whose type does not exist in the same revision', () => {
    expect(() => insertField({ type_id: 'nope' })).toThrow(/FOREIGN KEY/);
  });
});

describe('field_enum_options', () => {
  beforeEach(() => {
    insertRevision();
    insertType();
    insertField();
  });

  it('accepts a well-formed option', () => {
    expect(() => insertOption()).not.toThrow();
  });

  it('refuses a negative sort order', () => {
    expect(() => insertOption({ sort_order: -1 })).toThrow(
      'CHECK constraint failed: ck_field_enum_options_sort_order'
    );
  });

  it('refuses a key already used on the same field, case-insensitively', () => {
    insertOption();
    expect(() => insertOption({ id: 'option-2', key: 'RED' })).toThrow(/UNIQUE constraint failed/);
  });

  it('allows the same key on a different field', () => {
    insertField({ id: 'field-2', key: 'Accent' });
    insertOption();
    expect(() => insertOption({ id: 'option-2', field_id: 'field-2' })).not.toThrow();
  });

  it('refuses an option whose field does not exist in the same revision', () => {
    expect(() => insertOption({ field_id: 'nope' })).toThrow(/FOREIGN KEY/);
  });
});
