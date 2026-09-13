/**
 * Migration test for 0118_venue_mechanic_service_station (POPS-3744).
 *
 * `venue:auto` is renamed `venue:mechanic`, except on a car-hire tag set, where
 * it is removed because a car-hire firm has no venue. A service station gets a
 * venue of its own, and the car-related values get descriptions.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  description text,
  kind text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'seed',
  is_active integer NOT NULL DEFAULT 1,
  usage_count integer NOT NULL DEFAULT 0
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
`;

const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0118_venue_mechanic_service_station.sql'
  ),
  'utf8'
);

const MECHANIC =
  'A garage, mechanic or car-parts shop, where a vehicle is serviced, repaired or its parts bought. Not a petrol station (venue:service-station) or a car-hire firm.';
const SERVICE_STATION =
  'A petrol or service station, where fuel or EV charging is bought, including its shop. Not a mechanic (venue:mechanic).';

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(DDL);
  const vocab = raw.prepare(
    'INSERT INTO tag_vocabulary (tag, facet, kind, usage_count, description) VALUES (?, ?, ?, ?, ?)'
  );
  vocab.run('venue:auto', 'venue', 'closed', 2, 'A garage, mechanic or car-parts shop.');
  vocab.run('asset:car', 'asset', 'open', 287, null);
  vocab.run('contains:fuel', 'contains', 'open', 0, null);
  vocab.run('contains:tolls', 'contains', 'open', 0, null);
  vocab.run('contains:car-rental', 'contains', 'closed', 0, null);
});

afterEach(() => {
  raw.close();
});

type TagTable = 'transactions' | 'transaction_tag_rules' | 'transaction_corrections';

function insert(table: TagTable, id: string, text: string, tags: string[]): void {
  const column = table === 'transactions' ? 'description' : 'description_pattern';
  raw
    .prepare(`INSERT INTO ${table} (id, ${column}, tags) VALUES (?, ?, ?)`)
    .run(id, text, JSON.stringify(tags));
}

function tagsOf(table: TagTable, id: string): string[] {
  const row = raw.prepare(`SELECT tags FROM ${table} WHERE id = ?`).get(id) as { tags: string };
  return JSON.parse(row.tags) as string[];
}

interface VocabRow {
  tag: string;
  facet: string | null;
  description: string | null;
  kind: string;
  source: string;
  is_active: number;
  usage_count: number;
}

function vocab(tag: string): VocabRow | undefined {
  return raw.prepare('SELECT * FROM tag_vocabulary WHERE tag = ?').get(tag) as VocabRow | undefined;
}

function snapshot(): unknown {
  return {
    transactions: raw.prepare('SELECT * FROM transactions ORDER BY id').all(),
    rules: raw.prepare('SELECT * FROM transaction_tag_rules ORDER BY id').all(),
    corrections: raw.prepare('SELECT * FROM transaction_corrections ORDER BY id').all(),
    vocabulary: raw.prepare('SELECT * FROM tag_vocabulary ORDER BY tag').all(),
  };
}

describe('0118_venue_mechanic_service_station', () => {
  it('strips venue:auto from both prod car-hire rows, keeping every other tag in order', () => {
    insert('transactions', 'simba', 'SIMBA CAR HIRE CNS', [
      'venue:auto',
      'occasion:travel',
      'trip:cairns-2026',
      'contains:car-rental',
    ]);
    insert('transactions', 'airport', 'AIRPORTRENTALS.COM', [
      'venue:auto',
      'occasion:travel',
      'channel:online',
      'trip:cairns-2026',
      'contains:car-rental',
    ]);

    raw.exec(MIGRATION);

    expect(tagsOf('transactions', 'simba')).toEqual([
      'occasion:travel',
      'trip:cairns-2026',
      'contains:car-rental',
    ]);
    expect(tagsOf('transactions', 'airport')).toEqual([
      'occasion:travel',
      'channel:online',
      'trip:cairns-2026',
      'contains:car-rental',
    ]);
  });

  it('strips venue:auto from the SIMBA CAR HIRE rule and a car-hire correction rule', () => {
    insert('transaction_tag_rules', 'simba-rule', 'SIMBA CAR HIRE', [
      'venue:auto',
      'occasion:travel',
      'contains:car-rental',
    ]);
    insert('transaction_corrections', 'simba-correction', 'SIMBA CAR HIRE', [
      'occasion:travel',
      'venue:auto',
      'contains:car-rental',
    ]);

    raw.exec(MIGRATION);

    expect(tagsOf('transaction_tag_rules', 'simba-rule')).toEqual([
      'occasion:travel',
      'contains:car-rental',
    ]);
    expect(tagsOf('transaction_corrections', 'simba-correction')).toEqual([
      'occasion:travel',
      'contains:car-rental',
    ]);
  });

  it.each<TagTable>(['transactions', 'transaction_tag_rules', 'transaction_corrections'])(
    'renames a garage venue:auto to venue:mechanic in the same position in %s',
    (table) => {
      insert(table, 'garage', 'ANYTOWN AUTO REPAIRS', [
        'asset:car',
        'venue:auto',
        'contains:maintenance',
      ]);

      raw.exec(MIGRATION);

      expect(tagsOf(table, 'garage')).toEqual([
        'asset:car',
        'venue:mechanic',
        'contains:maintenance',
      ]);
    }
  );

  it.each<TagTable>(['transactions', 'transaction_tag_rules', 'transaction_corrections'])(
    'leaves venue:mechanic once when %s already carried it beside venue:auto',
    (table) => {
      insert(table, 'both', 'ANYTOWN AUTO REPAIRS', [
        'venue:mechanic',
        'contains:maintenance',
        'venue:auto',
      ]);
      insert(table, 'auto-first', 'ANYTOWN AUTO REPAIRS', [
        'venue:auto',
        'contains:maintenance',
        'venue:mechanic',
      ]);

      raw.exec(MIGRATION);

      expect(tagsOf(table, 'both')).toEqual(['venue:mechanic', 'contains:maintenance']);
      expect(tagsOf(table, 'auto-first')).toEqual(['venue:mechanic', 'contains:maintenance']);
    }
  );

  it('leaves a tag set without venue:auto untouched, duplicates and all', () => {
    insert('transactions', 'fuel', 'AMPOL FOODARY', ['contains:fuel', 'contains:fuel']);

    raw.exec(MIGRATION);

    expect(tagsOf('transactions', 'fuel')).toEqual(['contains:fuel', 'contains:fuel']);
  });

  it('adds venue:mechanic and venue:service-station as active closed seed values', () => {
    raw.exec(MIGRATION);

    expect(vocab('venue:mechanic')).toMatchObject({
      facet: 'venue',
      kind: 'closed',
      source: 'seed',
      is_active: 1,
      description: MECHANIC,
    });
    expect(vocab('venue:service-station')).toMatchObject({
      facet: 'venue',
      kind: 'closed',
      source: 'seed',
      is_active: 1,
      description: SERVICE_STATION,
    });
  });

  it('retires venue:auto by deactivating it, keeping the row', () => {
    raw.exec(MIGRATION);

    expect(vocab('venue:auto')).toMatchObject({ is_active: 0 });
  });

  it('describes the four car values', () => {
    raw.exec(MIGRATION);

    expect(vocab('asset:car')?.description).toBe(
      'Spend on a car the user owns or leases: charging, fuel, servicing, registration, the lease itself. Not a hire car.'
    );
    expect(vocab('contains:fuel')?.description).toBe(
      'Petrol or diesel bought for a vehicle. Not EV charging (contains:charging).'
    );
    expect(vocab('contains:tolls')?.description).toBe('Road or bridge tolls.');
    expect(vocab('contains:car-rental')?.description).toBe('A hire car, paid to a car-hire firm.');
  });

  it('recounts usage_count for the three venue values from deliberately wrong starts', () => {
    raw
      .prepare(
        "INSERT INTO tag_vocabulary (tag, facet, kind, usage_count) VALUES ('venue:mechanic', 'venue', 'closed', 50), ('venue:service-station', 'venue', 'closed', 7)"
      )
      .run();
    insert('transactions', 'simba', 'SIMBA CAR HIRE CNS', ['venue:auto', 'contains:car-rental']);
    insert('transactions', 'garage', 'ANYTOWN AUTO', ['venue:auto', 'contains:maintenance']);
    insert('transactions', 'dup', 'ANYTOWN AUTO', ['venue:auto', 'venue:mechanic']);
    insert('transactions', 'ampol', 'AMPOL', ['venue:service-station', 'contains:fuel']);

    raw.exec(MIGRATION);

    expect(vocab('venue:auto')?.usage_count).toBe(0);
    expect(vocab('venue:mechanic')?.usage_count).toBe(2);
    expect(vocab('venue:service-station')?.usage_count).toBe(1);
  });

  it('is idempotent: a second run changes nothing', () => {
    insert('transactions', 'simba', 'SIMBA CAR HIRE CNS', ['venue:auto', 'contains:car-rental']);
    insert('transactions', 'garage', 'ANYTOWN AUTO', ['venue:auto', 'contains:maintenance']);
    insert('transactions', 'dup', 'ANYTOWN AUTO', ['venue:auto', 'venue:mechanic']);
    insert('transaction_tag_rules', 'simba-rule', 'SIMBA CAR HIRE', [
      'venue:auto',
      'occasion:travel',
      'contains:car-rental',
    ]);
    insert('transaction_corrections', 'garage-correction', 'ANYTOWN AUTO', ['venue:auto']);

    raw.exec(MIGRATION);
    const afterFirst = snapshot();
    raw.exec(MIGRATION);

    expect(snapshot()).toEqual(afterFirst);
  });
});
