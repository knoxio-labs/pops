import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { readChanges } from '../../api/sync/changes.js';
import { readSyncState } from '../../api/sync/meta.js';
import {
  persistedItemTypesSeedParity,
  registerPersistedItemTypesMigrationFunctions,
} from '../migrations/persisted-item-types-bootstrap.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

import type { InventoryDb } from '../index.js';

let directory: string;
let databasePath: string;
let raw: Database.Database;
let legacyEpoch: string;

const representativeLegacyItems = [
  {
    id: 'book',
    name: 'The migration book',
    typeKey: 'book',
    fields:
      '{"Genre":"Science fiction","ISBN":"978-1-4028-9462-6","Length":"412","Type":"Hardcover"}',
  },
  {
    id: 'cable',
    name: 'The migration cable',
    typeKey: 'cable',
    fields:
      '{"Braided":true,"Data rate":{"value":40,"unit":"Gbps"},"End A":"USB-C","End B":"HDMI","Length":{"value":250,"unit":"cm"},"Power":{"value":100,"unit":"W"}}',
  },
  {
    id: 'charger',
    name: 'The migration charger',
    typeKey: 'charger',
    fields:
      '{"Folding pins":true,"Plug":"Type C","Ports":"USB-C × 2","Power":{"value":65,"unit":"W"}}',
  },
  {
    id: 'bulb',
    name: 'The migration bulb',
    typeKey: 'bulb',
    fields:
      '{"Brightness":{"value":800,"unit":"lm"},"Colour temperature":{"low":2700,"high":6500,"unit":"K"},"Dimmable":true,"Fitting":"E27","Protocol":"Wi-Fi"}',
  },
  {
    id: 'tape',
    name: 'The migration tape',
    typeKey: 'tape',
    fields:
      '{"Leaves residue":false,"Length":{"value":50,"unit":"m"},"Use":"Packing","Width":{"value":48,"unit":"mm"}}',
  },
  {
    id: 'storage-box',
    name: 'The migration storage box',
    typeKey: 'storage_box',
    fields:
      '{"Capacity":{"value":64,"unit":"L"},"Depth":{"value":400,"unit":"mm"},"Duty rating":"Heavy Duty","Height":{"value":0.3,"unit":"m"},"Load limit":{"value":25,"unit":"kg"},"Stackable":true,"Width":{"value":60,"unit":"cm"}}',
  },
  {
    id: 'furniture',
    name: 'The migration furniture',
    typeKey: 'furniture',
    fields: '{"Footprint":"120 × 60 cm","Material":"Walnut","Needs two people":true}',
  },
] as const;

const seedSchema = z.array(
  z
    .object({
      id: z.string(),
      key: z.string(),
      fields: z.array(
        z
          .object({
            id: z.string(),
            key: z.string(),
            options: z.array(z.object({ id: z.string(), key: z.string(), label: z.string() })),
          })
          .passthrough()
      ),
    })
    .passthrough()
);

function bootstrapSeed(): z.infer<typeof seedSchema> {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0017_persisted_item_types.sql'), 'utf8');
  const match = /INSERT INTO `migration_0017_catalogue_seed` VALUES \('(.+)'\);-->/.exec(sql);
  if (!match?.[1]) throw new Error('migration 0017 bootstrap seed is missing');
  return seedSchema.parse(JSON.parse(match[1].replaceAll("''", "'")));
}

function segment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => {
    return `%${character.codePointAt(0)?.toString(16).toUpperCase().padStart(2, '0')}`;
  });
}

function expectedUuid(name: string): string {
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const bytes = createHash('sha1').update(namespace).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function typeId(typeKey: string): string {
  return expectedUuid(`pops://inventory/type/${segment(typeKey)}`);
}

function fieldId(typeKey: string, fieldKey: string): string {
  return expectedUuid(`pops://inventory/type/${segment(typeKey)}/field/${segment(fieldKey)}`);
}

function optionId(typeKey: string, fieldKey: string, optionKey: string): string {
  return expectedUuid(
    `pops://inventory/type/${segment(typeKey)}/field/${segment(fieldKey)}/option/${segment(optionKey)}`
  );
}

function insertLegacyItem(
  database: Database.Database,
  item: (typeof representativeLegacyItems)[number],
  sequence: number
): void {
  database
    .prepare(
      `INSERT INTO items (id, name, type_key, fields, placement_kind, location_id, is_container, access, last_edited_time, revision, seq) VALUES (?, ?, ?, ?, 'location', 'garage', 0, NULL, '2026-09-22T00:00:00Z', 1, ?)`
    )
    .run(item.id, item.name, item.typeKey, item.fields, sequence);
}

function catalogueRows(database: Database.Database): {
  readonly types: unknown[];
  readonly fields: unknown[];
  readonly options: unknown[];
} {
  return {
    types: database
      .prepare(
        `SELECT id, key, label, capabilities_json, legacy_labels_json, presentation_json FROM item_types ORDER BY key`
      )
      .all(),
    fields: database
      .prepare(
        `SELECT id, type_id, key, label, kind, fixed_unit, presentation_json FROM item_type_fields ORDER BY type_id, key`
      )
      .all(),
    options: database
      .prepare(`SELECT id, field_id, key, label FROM field_enum_options ORDER BY field_id, key`)
      .all(),
  };
}

function schemaRows(database: Database.Database): unknown[] {
  return database
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name IN ('catalogue_revisions', 'item_types', 'item_type_fields', 'field_enum_options', 'item_field_values', 'items') OR tbl_name IN ('catalogue_revisions', 'item_types', 'item_type_fields', 'field_enum_options', 'item_field_values', 'items') ORDER BY type, name`
    )
    .all();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inventory-persisted-types-'));
  databasePath = join(directory, 'inventory.db');
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: '0016_storage_box_dimensions',
    targetFolder: join(directory, 'staged-migrations'),
  });
  raw = new Database(databasePath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });
  raw
    .prepare(
      `INSERT INTO locations (id, name, sort_order, last_edited_time) VALUES ('garage', 'Garage', 0, '2026-09-22T00:00:00Z')`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO items (id, name, type_key, fields, placement_kind, location_id, is_container, access, last_edited_time, revision, seq) VALUES ('lamp', 'Lamp', 'bulb', '{"Fitting":"E27","Colour temperature":{"low":2700,"high":6500,"unit":"K"}}', 'location', 'garage', 0, NULL, '2026-09-22T00:00:00Z', 1, 1)`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO items (id, name, type_key, fields, placement_kind, location_id, is_container, access, last_edited_time, revision, seq) VALUES ('tiny', 'Tiny box', 'storage_box', '{"Width":{"value":1e-7,"unit":"cm"}}', 'location', 'garage', 1, 'open', '2026-09-22T00:00:00Z', 1, 2)`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO items (id, name, type_key, fields, placement_kind, location_id, is_container, access, last_edited_time, revision, seq) VALUES ('exponent-lamp', 'Exponent lamp', 'bulb', '{"Colour temperature":{"low":2.7e3,"high":6.5e3,"unit":"K"}}', 'location', 'garage', 0, NULL, '2026-09-22T00:00:00Z', 1, 3)`
    )
    .run();
  for (const [index, item] of representativeLegacyItems.entries()) {
    insertLegacyItem(raw, item, index + 4);
  }
  legacyEpoch = (
    raw.prepare(`SELECT value FROM sync_meta WHERE key = 'epoch'`).get() as { value: string }
  ).value;
  raw.close();
  raw = new Database(databasePath);
  raw.pragma('foreign_keys = ON');
  registerPersistedItemTypesMigrationFunctions(raw);
  migrate(drizzle(raw), { migrationsFolder: MIGRATIONS_DIR });
});

afterEach(() => {
  raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('0017_persisted_item_types', () => {
  it('guards every deterministic type, field, and option identity in the embedded seed', () => {
    const seed = bootstrapSeed();
    expect(persistedItemTypesSeedParity(JSON.stringify(seed))).toBe(1);
    for (const type of seed) {
      const typeName = `pops://inventory/type/${segment(type.key)}`;
      expect(type.id).toBe(expectedUuid(typeName));
      for (const field of type.fields) {
        const fieldName = `${typeName}/field/${segment(field.key)}`;
        expect(field.id).toBe(expectedUuid(fieldName));
        for (const option of field.options) {
          expect(option.id).toBe(expectedUuid(`${fieldName}/option/${segment(option.key)}`));
        }
      }
    }
    const endA = seed
      .find((type) => type.key === 'cable')
      ?.fields.find((field) => field.key === 'End A');
    expect(endA?.id).toBe(expectedUuid('pops://inventory/type/cable/field/End%20A'));
  });

  it.each(['type', 'field', 'option'] as const)('rejects a tampered %s identity', (kind) => {
    const seed = bootstrapSeed();
    const type = seed[0];
    const field = type?.fields[0];
    const option = field?.options[0];
    if (!type || !field || !option) throw new Error('bootstrap seed is incomplete');
    if (kind === 'type') type.id = '00000000-0000-5000-8000-000000000000';
    if (kind === 'field') field.id = '00000000-0000-5000-8000-000000000000';
    if (kind === 'option') option.id = '00000000-0000-5000-8000-000000000000';
    expect(() => persistedItemTypesSeedParity(JSON.stringify(seed))).toThrow(/invalid id/);
  });

  it('rejects an option key even when its UUID is recomputed consistently', () => {
    const seed = bootstrapSeed();
    const type = seed.find((candidate) => candidate.key === 'bulb');
    const field = type?.fields.find((candidate) => candidate.key === 'Fitting');
    const option = field?.options.find((candidate) => candidate.label === 'E27');
    if (!type || !field || !option) throw new Error('bootstrap seed is incomplete');
    option.key = 'changed_key';
    option.id = expectedUuid(
      `pops://inventory/type/${segment(type.key)}/field/${segment(field.key)}/option/${segment(option.key)}`
    );

    expect(() => persistedItemTypesSeedParity(JSON.stringify(seed))).toThrow(/invalid option keys/);
  });

  it('rejects colliding option keys instead of suffixing them', () => {
    const seed = bootstrapSeed();
    const type = seed.find((candidate) => candidate.key === 'bulb');
    const field = type?.fields.find((candidate) => candidate.key === 'Fitting');
    const [first, second] = field?.options ?? [];
    if (!type || !field || !first || !second) throw new Error('bootstrap seed is incomplete');
    first.label = 'A-B';
    first.key = 'a_b';
    second.label = 'A B';
    second.key = 'a_b';
    const optionName = `pops://inventory/type/${segment(type.key)}/field/${segment(field.key)}/option/a_b`;
    first.id = expectedUuid(optionName);
    second.id = expectedUuid(optionName);

    expect(() => persistedItemTypesSeedParity(JSON.stringify(seed))).toThrow(/invalid option keys/);
  });

  it('preserves every seeded type, field, and enum option with its deterministic identity', () => {
    const seed = bootstrapSeed();
    const rows = catalogueRows(raw);

    expect(rows.types).toHaveLength(seed.length);
    expect(rows.fields).toHaveLength(seed.reduce((count, type) => count + type.fields.length, 0));
    expect(rows.options).toHaveLength(
      seed.reduce(
        (count, type) =>
          count + type.fields.reduce((fieldCount, field) => fieldCount + field.options.length, 0),
        0
      )
    );

    for (const type of seed) {
      const persistedType = raw
        .prepare(
          `SELECT id, key, label, capabilities_json, legacy_labels_json, presentation_json FROM item_types WHERE key = ?`
        )
        .get(type.key);
      expect(persistedType).toEqual({
        id: typeId(type.key),
        key: type.key,
        label: type.label,
        capabilities_json: JSON.stringify(type.capabilities),
        legacy_labels_json: JSON.stringify(type.legacyLabels),
        presentation_json: JSON.stringify(type.presentation),
      });

      for (const field of type.fields) {
        const persistedField = raw
          .prepare(
            `SELECT id, type_id, key, label, kind, fixed_unit, presentation_json FROM item_type_fields WHERE type_id = ? AND key = ?`
          )
          .get(typeId(type.key), field.key);
        expect(persistedField).toEqual({
          id: fieldId(type.key, field.key),
          type_id: typeId(type.key),
          key: field.key,
          label: field.label,
          kind: field.kind,
          fixed_unit: field.fixedUnit,
          presentation_json: JSON.stringify(field.presentation),
        });

        for (const option of field.options) {
          expect(
            raw
              .prepare(
                `SELECT id, field_id, key, label FROM field_enum_options WHERE field_id = ? AND key = ?`
              )
              .get(fieldId(type.key, field.key), option.key)
          ).toEqual({
            id: optionId(type.key, field.key, option.key),
            field_id: fieldId(type.key, field.key),
            key: option.key,
            label: option.label,
          });
        }
      }
    }
  });

  it('converts representative values for all seven built-ins without changing item identities', () => {
    const expectedValues = new Map<string, readonly [string, string][]>([
      [
        'book',
        [
          [
            fieldId('book', 'Genre'),
            JSON.stringify({ optionId: optionId('book', 'Genre', 'science_fiction') }),
          ],
          [fieldId('book', 'ISBN'), JSON.stringify('978-1-4028-9462-6')],
          [fieldId('book', 'Length'), JSON.stringify('412')],
          [
            fieldId('book', 'Type'),
            JSON.stringify({ optionId: optionId('book', 'Type', 'hardcover') }),
          ],
        ],
      ],
      [
        'cable',
        [
          [fieldId('cable', 'Braided'), 'true'],
          [fieldId('cable', 'Data rate'), '{"amount":"40","unit":"Gbps"}'],
          [
            fieldId('cable', 'End A'),
            JSON.stringify({ optionId: optionId('cable', 'End A', 'usb_c') }),
          ],
          [
            fieldId('cable', 'End B'),
            JSON.stringify({ optionId: optionId('cable', 'End B', 'hdmi') }),
          ],
          [fieldId('cable', 'Length'), '{"amount":"2.5","unit":"m"}'],
          [fieldId('cable', 'Power'), '{"amount":"100","unit":"W"}'],
        ],
      ],
      [
        'charger',
        [
          [fieldId('charger', 'Folding pins'), 'true'],
          [
            fieldId('charger', 'Plug'),
            JSON.stringify({ optionId: optionId('charger', 'Plug', 'type_c') }),
          ],
          [fieldId('charger', 'Ports'), JSON.stringify('USB-C × 2')],
          [fieldId('charger', 'Power'), '{"amount":"65","unit":"W"}'],
        ],
      ],
      [
        'bulb',
        [
          [fieldId('bulb', 'Brightness'), '{"amount":"800","unit":"lm"}'],
          [fieldId('bulb', 'Colour temperature minimum'), '{"amount":"2700","unit":"K"}'],
          [fieldId('bulb', 'Colour temperature maximum'), '{"amount":"6500","unit":"K"}'],
          [fieldId('bulb', 'Dimmable'), 'true'],
          [
            fieldId('bulb', 'Fitting'),
            JSON.stringify({ optionId: optionId('bulb', 'Fitting', 'e27') }),
          ],
          [
            fieldId('bulb', 'Protocol'),
            JSON.stringify({ optionId: optionId('bulb', 'Protocol', 'wi_fi') }),
          ],
        ],
      ],
      [
        'tape',
        [
          [fieldId('tape', 'Leaves residue'), 'false'],
          [fieldId('tape', 'Length'), '{"amount":"50","unit":"m"}'],
          [
            fieldId('tape', 'Use'),
            JSON.stringify({ optionId: optionId('tape', 'Use', 'packing') }),
          ],
          [fieldId('tape', 'Width'), '{"amount":"48","unit":"mm"}'],
        ],
      ],
      [
        'storage-box',
        [
          [fieldId('storage_box', 'Capacity'), '{"amount":"64","unit":"L"}'],
          [fieldId('storage_box', 'Depth'), '{"amount":"40","unit":"cm"}'],
          [
            fieldId('storage_box', 'Duty rating'),
            JSON.stringify({ optionId: optionId('storage_box', 'Duty rating', 'heavy_duty') }),
          ],
          [fieldId('storage_box', 'Height'), '{"amount":"30","unit":"cm"}'],
          [fieldId('storage_box', 'Load limit'), '{"amount":"25","unit":"kg"}'],
          [fieldId('storage_box', 'Stackable'), 'true'],
          [fieldId('storage_box', 'Width'), '{"amount":"60","unit":"cm"}'],
        ],
      ],
      [
        'furniture',
        [
          [fieldId('furniture', 'Footprint'), JSON.stringify('120 × 60 cm')],
          [
            fieldId('furniture', 'Material'),
            JSON.stringify({ optionId: optionId('furniture', 'Material', 'walnut') }),
          ],
          [fieldId('furniture', 'Needs two people'), 'true'],
        ],
      ],
    ]);

    for (const item of representativeLegacyItems) {
      expect(raw.prepare(`SELECT id, name, type_id FROM items WHERE id = ?`).get(item.id)).toEqual({
        id: item.id,
        name: item.name,
        type_id: typeId(item.typeKey),
      });
      expect(
        raw
          .prepare(
            `SELECT field_id, value_json FROM item_field_values WHERE item_id = ? ORDER BY field_id`
          )
          .all(item.id)
      ).toEqual(
        (expectedValues.get(item.id) ?? [])
          .map(([field_id, value_json]) => ({ field_id, value_json }))
          .toSorted((left, right) => left.field_id.localeCompare(right.field_id))
      );
    }
  });

  it('produces the same catalogue schema and seed rows as a fresh database', () => {
    const freshPath = join(directory, 'fresh-inventory.db');
    const fresh = new Database(freshPath);
    fresh.pragma('foreign_keys = ON');
    registerPersistedItemTypesMigrationFunctions(fresh);
    migrate(drizzle(fresh), { migrationsFolder: MIGRATIONS_DIR });

    expect(schemaRows(raw)).toEqual(schemaRows(fresh));
    expect(catalogueRows(raw)).toEqual(catalogueRows(fresh));

    fresh.close();
  });

  it('is idempotent when the migration runner is invoked again', () => {
    const before = {
      catalogue: catalogueRows(raw),
      values: raw
        .prepare(
          `SELECT item_id, field_id, source, ordinal, value_json, catalogue_revision FROM item_field_values ORDER BY item_id, field_id, source, ordinal`
        )
        .all(),
      migrations: raw.prepare(`SELECT count(*) AS count FROM __drizzle_migrations`).get(),
    };

    migrate(drizzle(raw), { migrationsFolder: MIGRATIONS_DIR });

    expect({
      catalogue: catalogueRows(raw),
      values: raw
        .prepare(
          `SELECT item_id, field_id, source, ordinal, value_json, catalogue_revision FROM item_field_values ORDER BY item_id, field_id, source, ordinal`
        )
        .all(),
      migrations: raw.prepare(`SELECT count(*) AS count FROM __drizzle_migrations`).get(),
    }).toEqual(before);
  });

  it('publishes all seven built-ins and converts the bulb range into measurements', () => {
    expect(
      raw.prepare(`SELECT count(*) AS count FROM item_types WHERE revision = 1`).get()
    ).toEqual({ count: 7 });
    expect(raw.prepare(`SELECT type_id FROM items WHERE id = 'lamp'`).get()).toEqual({
      type_id: '59538480-6e82-5ccc-b7be-f1cfd15b9af6',
    });
    expect(
      raw
        .prepare(
          `SELECT value_json FROM item_field_values WHERE item_id = 'lamp' ORDER BY field_id`
        )
        .all()
    ).toEqual(
      expect.arrayContaining([
        { value_json: '{"amount":"2700","unit":"K"}' },
        { value_json: '{"amount":"6500","unit":"K"}' },
        { value_json: '{"optionId":"fe0961ec-278a-51f2-b319-79d1fe553391"}' },
      ])
    );
  });

  it('migrates exact exponent measurements and range endpoints', () => {
    expect(
      raw.prepare(`SELECT value_json FROM item_field_values WHERE item_id = 'tiny'`).get()
    ).toEqual({ value_json: '{"amount":"0.0000001","unit":"cm"}' });
    expect(
      raw
        .prepare(
          `SELECT value_json FROM item_field_values WHERE item_id = 'exponent-lamp' ORDER BY value_json`
        )
        .all()
    ).toEqual([
      { value_json: '{"amount":"2700","unit":"K"}' },
      { value_json: '{"amount":"6500","unit":"K"}' },
    ]);
  });

  it('rotates the sync epoch when canonical conversion changes protocol-1 values', () => {
    const database = drizzle(raw) as InventoryDb;
    const state = readSyncState(database);
    expect(state.epoch).not.toBe(legacyEpoch);
    expect(() =>
      readChanges(database, state, { since: state.maxSeq, epoch: legacyEpoch, limit: 10 })
    ).toThrow('the client is following another epoch');
  });

  it.each([
    ['unknown type', 'not_a_type', '{}', /type_key.*NOT EXISTS/u],
    ['unknown field', 'bulb', '{"Unknown":"value"}', /json_each/u],
    ['invalid enum option', 'bulb', '{"Fitting":"E99"}', /field_enum_options/u],
    [
      'invalid measurement unit',
      'storage_box',
      '{"Width":{"value":10,"unit":"furlong"}}',
      /fixed_unit/u,
    ],
    [
      'invalid measurement value',
      'storage_box',
      '{"Width":{"value":"ten","unit":"cm"}}',
      /json_type/u,
    ],
    [
      'measurement precision overflow',
      'storage_box',
      '{"Width":{"value":1.1234567891,"unit":"cm"}}',
      /inventory_migrate_measurement_value/u,
    ],
  ])('rolls back every 0017 change when a row has an %s', (_name, typeKey, fields, diagnostic) => {
    const failingDirectory = mkdtempSync(join(tmpdir(), 'inventory-persisted-types-failure-'));
    const failingPath = join(failingDirectory, 'inventory.db');
    const staged = stageMigrationsThrough({
      migrationsFolder: MIGRATIONS_DIR,
      through: '0016_storage_box_dimensions',
      targetFolder: join(failingDirectory, 'staged-migrations'),
    });
    const failing = new Database(failingPath);
    failing.pragma('foreign_keys = ON');
    migrate(drizzle(failing), { migrationsFolder: staged });
    failing
      .prepare(
        `INSERT INTO locations (id, name, sort_order, last_edited_time) VALUES ('garage', 'Garage', 0, '2026-09-22T00:00:00Z')`
      )
      .run();
    const insert = failing.prepare(
      `INSERT INTO items (id, name, type_key, fields, placement_kind, location_id, is_container, access, last_edited_time, revision, seq) VALUES (?, ?, ?, ?, 'location', 'garage', 0, NULL, '2026-09-22T00:00:00Z', 1, ?)`
    );
    insert.run('good', 'Good lamp', 'bulb', '{"Fitting":"E27"}', 1);
    insert.run('bad', 'Bad item', typeKey, fields, 2);
    registerPersistedItemTypesMigrationFunctions(failing);

    expect(() => migrate(drizzle(failing), { migrationsFolder: MIGRATIONS_DIR })).toThrow(
      diagnostic
    );
    expect(
      failing
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'catalogue_revisions'`
        )
        .get()
    ).toBeUndefined();
    expect(failing.prepare(`SELECT count(*) AS count FROM __drizzle_migrations`).get()).toEqual({
      count: 12,
    });
    expect(failing.prepare(`SELECT id, type_key, fields FROM items ORDER BY id`).all()).toEqual([
      { id: 'bad', type_key: typeKey, fields },
      { id: 'good', type_key: 'bulb', fields: '{"Fitting":"E27"}' },
    ]);

    failing.close();
    rmSync(failingDirectory, { recursive: true, force: true });
  });
});
