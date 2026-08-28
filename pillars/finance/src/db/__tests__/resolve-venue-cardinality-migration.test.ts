/**
 * Migration test for 0076_resolve_venue_cardinality (POPS-2607).
 *
 * The reason this migration is descriptor-keyed rather than rule-based is the
 * case worth pinning hardest: `venue:takeaway` + `venue:restaurant` resolves to
 * takeaway on `OZTURK JR` and to restaurant on `PHO MOM`. A test that only
 * checked one of them would pass against an implementation that had collapsed
 * the two into a single wrong rule.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0076_resolve_venue_cardinality.sql'),
    'utf8'
  );
}

const MIGRATION = migrationSql();

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function seedTransaction(id: string, description: string, tags: readonly string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, tags) VALUES (?, ?, ?)')
    .run(id, description, JSON.stringify(tags));
}

function seedRule(id: string, pattern: string, tags: readonly string[]): void {
  raw
    .prepare('INSERT INTO transaction_tag_rules (id, description_pattern, tags) VALUES (?, ?, ?)')
    .run(id, pattern, JSON.stringify(tags));
}

function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

function tagsOf(table: string, id: string): string[] {
  const row = raw.prepare(`SELECT tags FROM ${table} WHERE id = ?`).get(id) as
    | { tags: string }
    | undefined;
  if (!row) throw new Error(`${table} ${id} vanished`);
  return JSON.parse(row.tags) as string[];
}

describe('0076 — the same tag pair resolves differently per merchant', () => {
  it('keeps takeaway on OZTURK and restaurant on PHO MOM, from one run', () => {
    seedTransaction('t1', 'OZTURK JR 176752        DARLINGTON', [
      'contains:fast-food',
      'venue:takeaway',
      'contains:food',
      'venue:restaurant',
      'occasion:out',
    ]);
    seedTransaction('t2', 'PHO MOM PTY LTD', [
      'occasion:out',
      'contains:food',
      'venue:restaurant',
      'venue:takeaway',
    ]);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual([
      'contains:fast-food',
      'venue:takeaway',
      'occasion:out',
    ]);
    expect(tagsOf('transactions', 't2')).toEqual([
      'occasion:out',
      'contains:food',
      'venue:restaurant',
    ]);
  });

  it('keeps takeaway on the FISHBO descriptor', () => {
    seedTransaction('t1', 'WWW.FISHBO* SOUTH EVEL  ROSEBERY', [
      'contains:food',
      'venue:takeaway',
      'venue:restaurant',
    ]);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['contains:food', 'venue:takeaway']);
  });
});

describe('0076 — the remaining calls', () => {
  it('keeps occasion:travel on FAT COW, because trip: cannot imply it', () => {
    seedTransaction('t1', 'FAT COW HUNTER VALLEY P Burwood', [
      'occasion:out',
      'occasion:travel',
      'contains:food',
      'trip:hunter-valley-2026',
    ]);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual([
      'occasion:travel',
      'contains:food',
      'trip:hunter-valley-2026',
    ]);
  });

  it('keeps restaurant on LUCKY CAT after 0075 turned its bar into a pub', () => {
    seedTransaction('t1', 'LUCKY CAT 318518        DARLINGHURST', [
      'occasion:out',
      'contains:food',
      'venue:restaurant',
      'contains:alcohol',
      'venue:pub',
    ]);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual([
      'occasion:out',
      'contains:food',
      'venue:restaurant',
      'contains:alcohol',
    ]);
  });

  it('resolves LUCKY CAT written any case, and before 0075 ran', () => {
    seedTransaction('t1', 'Lucky Cat', ['venue:restaurant', 'venue:bar', 'contains:alcohol']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['venue:restaurant', 'contains:alcohol']);
  });
});

describe('0076 — the rules that produced the rows', () => {
  it('resolves the tag rule too, or re-evaluation writes the venue back', () => {
    seedRule('r1', 'ozturk jr kebab', [
      'contains:fast-food',
      'venue:takeaway',
      'contains:food',
      'venue:restaurant',
    ]);
    seedRule('r2', 'PHO MOM', ['venue:restaurant', 'venue:takeaway']);

    migrate();

    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual(['contains:fast-food', 'venue:takeaway']);
    expect(tagsOf('transaction_tag_rules', 'r2')).toEqual(['venue:restaurant']);
  });

  it('leaves an unrelated merchant completely alone', () => {
    seedTransaction('t1', 'STONEWALL HOTEL', ['venue:pub', 'contains:alcohol', 'occasion:out']);
    seedRule('r1', 'stonewall', ['venue:pub']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['venue:pub', 'contains:alcohol', 'occasion:out']);
    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual(['venue:pub']);
  });

  it('does not strip contains:food from a merchant that is not OZTURK', () => {
    seedTransaction('t1', 'HARRIS FARM MARKETS', ['contains:food', 'venue:supermarket']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['contains:food', 'venue:supermarket']);
  });
});

describe('0076 — idempotency', () => {
  it('is a no-op on a second run', () => {
    seedTransaction('t1', 'OZTURK JR 176752', [
      'contains:fast-food',
      'venue:takeaway',
      'contains:food',
      'venue:restaurant',
    ]);
    seedRule('r1', 'LUCKY CAT', ['venue:restaurant', 'venue:pub']);

    migrate();
    const afterFirst = {
      t1: tagsOf('transactions', 't1'),
      r1: tagsOf('transaction_tag_rules', 'r1'),
    };

    migrate();

    expect({
      t1: tagsOf('transactions', 't1'),
      r1: tagsOf('transaction_tag_rules', 'r1'),
    }).toEqual(afterFirst);
  });
});

describe('0076 — a drop needs the value it is being resolved against', () => {
  /**
   * These are all the same defect from different angles: keyed on the descriptor
   * alone, the migration reads "FAT COW never means occasion:out" rather than
   * "on FAT COW, occasion:travel wins" — and a later row from the same merchant
   * carrying only the losing value would come out of a cardinality fix with an
   * empty required facet.
   */
  it('leaves a FAT COW row that never had occasion:travel beside it', () => {
    seedTransaction('t1', 'FAT COW HUNTER VALLEY P Burwood', ['occasion:out', 'contains:food']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['occasion:out', 'contains:food']);
  });

  it('leaves a PHO MOM row carrying only the losing venue', () => {
    seedTransaction('t1', 'PHO MOM PTY LTD', ['occasion:out', 'venue:takeaway']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['occasion:out', 'venue:takeaway']);
  });

  it('keeps contains:food on an OZTURK row with no contains:fast-food to imply it', () => {
    seedTransaction('t1', 'OZTURK JR 176752        DARLINGTON', [
      'contains:food',
      'venue:takeaway',
      'venue:restaurant',
    ]);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['contains:food', 'venue:takeaway']);
  });

  it('leaves a LUCKY CAT rule that only ever wrote the losing venue', () => {
    seedRule('r1', 'LUCKY CAT', ['venue:pub', 'contains:alcohol']);

    migrate();

    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual(['venue:pub', 'contains:alcohol']);
  });
});
