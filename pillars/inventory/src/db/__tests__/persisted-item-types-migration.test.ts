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
    ['unknown type', 'not_a_type', '{}'],
    ['unknown field', 'bulb', '{"Unknown":"value"}'],
    ['invalid enum option', 'bulb', '{"Fitting":"E99"}'],
    ['invalid measurement unit', 'storage_box', '{"Width":{"value":10,"unit":"furlong"}}'],
    ['invalid measurement value', 'storage_box', '{"Width":{"value":"ten","unit":"cm"}}'],
    [
      'measurement precision overflow',
      'storage_box',
      '{"Width":{"value":1.1234567891,"unit":"cm"}}',
    ],
  ])('rolls back every 0017 change when a row has an %s', (_name, typeKey, fields) => {
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

    expect(() => migrate(drizzle(failing), { migrationsFolder: MIGRATIONS_DIR })).toThrow();
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

    failing.close();
    rmSync(failingDirectory, { recursive: true, force: true });
  });
});
