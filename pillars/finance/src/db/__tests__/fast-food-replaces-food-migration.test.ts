/**
 * Migration test for 0121_fast_food_replaces_food (POPS-3952).
 *
 * contains:food leaves every row, rule and correction that also carries
 * contains:fast-food, and nothing else changes. The definitions are read back
 * from a database built by the real journal, because an UPDATE keyed on a
 * misspelled tag succeeds and changes nothing.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listVocabularyDescriptions } from '../services/tag-vocabulary.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

const DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  description text
);
CREATE TABLE transactions (id text PRIMARY KEY NOT NULL, tags text NOT NULL DEFAULT '[]');
CREATE TABLE transaction_tag_rules (id text PRIMARY KEY NOT NULL, tags text NOT NULL DEFAULT '[]');
CREATE TABLE transaction_corrections (id text PRIMARY KEY NOT NULL, tags text NOT NULL DEFAULT '[]');
`;

const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0121_fast_food_replaces_food.sql'
  ),
  'utf8'
);

type TaggedTable = 'transactions' | 'transaction_tag_rules' | 'transaction_corrections';

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(DDL);
});

afterEach(() => {
  raw.close();
});

function insert(table: TaggedTable, id: string, tags: string[]): void {
  raw.prepare(`INSERT INTO ${table} (id, tags) VALUES (?, ?)`).run(id, JSON.stringify(tags));
}

function tagsOf(table: TaggedTable, id: string): string[] {
  const row = raw.prepare(`SELECT tags FROM ${table} WHERE id = ?`).get(id) as { tags: string };
  return JSON.parse(row.tags) as string[];
}

function snapshot(): unknown {
  return {
    transactions: raw.prepare('SELECT * FROM transactions ORDER BY id').all(),
    rules: raw.prepare('SELECT * FROM transaction_tag_rules ORDER BY id').all(),
    corrections: raw.prepare('SELECT * FROM transaction_corrections ORDER BY id').all(),
    vocabulary: raw.prepare('SELECT * FROM tag_vocabulary ORDER BY tag').all(),
  };
}

describe('0121_fast_food_replaces_food rows', () => {
  it.each<TaggedTable>(['transactions', 'transaction_tag_rules', 'transaction_corrections'])(
    'drops contains:food beside contains:fast-food in %s, keeping the rest in order',
    (table) => {
      insert(table, 'kfc', [
        'occasion:out',
        'contains:food',
        'contains:fast-food',
        'venue:takeaway',
      ]);

      raw.exec(MIGRATION);

      expect(tagsOf(table, 'kfc')).toEqual([
        'occasion:out',
        'contains:fast-food',
        'venue:takeaway',
      ]);
    }
  );

  it('leaves contains:food alone on a row without contains:fast-food', () => {
    insert('transactions', 'sushi', ['contains:food', 'venue:restaurant']);

    raw.exec(MIGRATION);

    expect(tagsOf('transactions', 'sushi')).toEqual(['contains:food', 'venue:restaurant']);
  });

  it('leaves a fast-food row without contains:food alone', () => {
    insert('transactions', 'maccas', ['contains:fast-food', 'venue:takeaway']);

    raw.exec(MIGRATION);

    expect(tagsOf('transactions', 'maccas')).toEqual(['contains:fast-food', 'venue:takeaway']);
  });

  it('recounts contains:food from the rows left and leaves other counts alone', () => {
    raw
      .prepare('INSERT INTO tag_vocabulary (tag, usage_count) VALUES (?, ?)')
      .run('contains:food', 40);
    raw
      .prepare('INSERT INTO tag_vocabulary (tag, usage_count) VALUES (?, ?)')
      .run('contains:fast-food', 7);
    insert('transactions', 'kfc', ['contains:food', 'contains:fast-food']);
    insert('transactions', 'sushi', ['contains:food']);

    raw.exec(MIGRATION);

    const count = (tag: string): number =>
      (
        raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get(tag) as {
          usage_count: number;
        }
      ).usage_count;
    expect(count('contains:food')).toBe(1);
    expect(count('contains:fast-food')).toBe(7);
  });

  it('is idempotent: a second run changes nothing', () => {
    raw
      .prepare('INSERT INTO tag_vocabulary (tag, usage_count) VALUES (?, ?)')
      .run('contains:food', 3);
    insert('transactions', 'kfc', ['contains:food', 'contains:fast-food']);
    insert('transaction_tag_rules', 'rule', ['contains:fast-food', 'contains:food']);
    insert('transactions', 'sushi', ['contains:food']);

    raw.exec(MIGRATION);
    const afterFirst = snapshot();
    raw.exec(MIGRATION);

    expect(snapshot()).toEqual(afterFirst);
  });
});

describe('0121_fast_food_replaces_food definitions', () => {
  it('makes fast-food and food exclusive from both sides', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    expect(descriptions.get('contains:fast-food')).toMatch(/never both/);
    expect(descriptions.get('contains:fast-food')).not.toMatch(/also carries contains:food/);
    expect(descriptions.get('contains:food')).toMatch(/contains:fast-food instead/);
  });

  it('makes restaurant the default venue for a meal and narrows takeaway', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    expect(descriptions.get('venue:restaurant')).toMatch(/does not show counter service/);
    expect(descriptions.get('venue:takeaway')).toMatch(/venue:restaurant, not this/);
  });

  it('keeps every rewritten definition within the 200-char prompt field cap', () => {
    const descriptions = listVocabularyDescriptions(freshMigratedFinanceDb().db);

    for (const tag of [
      'contains:fast-food',
      'contains:food',
      'venue:restaurant',
      'venue:takeaway',
    ]) {
      expect((descriptions.get(tag) ?? '').length, `${tag} exceeds 200 chars`).toBeLessThanOrEqual(
        200
      );
    }
  });
});
