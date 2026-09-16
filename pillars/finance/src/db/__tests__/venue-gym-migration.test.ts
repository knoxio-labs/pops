/**
 * Migration test for 0112_venue_gym (POPS-3689).
 *
 * The statements are keyed on the Plus Fitness entity and on a wrong venue still
 * being present, so the cases that matter are the ones it must NOT touch: a gym
 * row a person left without a venue stays without one, another merchant's
 * venue:club stays a club, and every tag other than the venue survives the move.
 * A migration that got any of those wrong would still turn the three wrong rows
 * into gyms, which is why they are asserted separately.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GYM = '2d8c0f12-758d-4b21-941c-9da76877bfae';
const OTHER = 'entity-palms-on-oxford';

const PRE_MIGRATION_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  kind text NOT NULL DEFAULT 'open',
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  description text
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  entity_id text,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  entity_id text,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  entity_id text,
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
    '0112_venue_gym.sql'
  ),
  'utf8'
);

let db: Database.Database;

function migrate(): void {
  for (const statement of MIGRATION.split('--> statement-breakpoint')) {
    if (statement.trim() !== '') db.exec(statement);
  }
}

function vocab(tag: string, count: number): void {
  db.prepare('INSERT INTO tag_vocabulary (tag, facet, kind, usage_count) VALUES (?, ?, ?, ?)').run(
    tag,
    tag.split(':')[0],
    'closed',
    count
  );
}

function txn(id: string, entityId: string | null, tags: string[]): void {
  db.prepare('INSERT INTO transactions (id, description, entity_id, tags) VALUES (?, ?, ?, ?)').run(
    id,
    `DESC ${id}`,
    entityId,
    JSON.stringify(tags)
  );
}

function tagsOf(table: string, id: string): string[] {
  const row = db.prepare(`SELECT tags FROM ${table} WHERE id = ?`).get(id) as { tags: string };
  return JSON.parse(row.tags) as string[];
}

function usage(tag: string): number | undefined {
  return (
    db.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get(tag) as
      | { usage_count: number }
      | undefined
  )?.usage_count;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(PRE_MIGRATION_DDL);
  vocab('venue:club', 10);
  vocab('venue:sauna', 4);
});

afterEach(() => {
  db.close();
});

describe('0112_venue_gym', () => {
  it('adds venue:gym as a closed, described, seeded value', () => {
    migrate();

    expect(
      db
        .prepare(
          "SELECT facet, kind, source, is_active, description FROM tag_vocabulary WHERE tag = 'venue:gym'"
        )
        .get()
    ).toEqual({
      facet: 'venue',
      kind: 'closed',
      source: 'seed',
      is_active: 1,
      description: expect.stringMatching(/Not a nightclub, and not a sauna/),
    });
  });

  it('moves a club row and a sauna row to gym, keeping every other tag in place', () => {
    txn('club', GYM, ['venue:club', 'occasion:health', 'contains:fitness', 'fee:membership']);
    txn('sauna', GYM, ['venue:sauna', 'occasion:out', 'contains:fitness']);

    migrate();

    expect(tagsOf('transactions', 'club')).toEqual([
      'occasion:health',
      'contains:fitness',
      'fee:membership',
      'venue:gym',
    ]);
    expect(tagsOf('transactions', 'sauna')).toEqual([
      'occasion:out',
      'contains:fitness',
      'venue:gym',
    ]);
  });

  it('does not give a venue to a gym row a person left without one', () => {
    txn('no-venue', GYM, ['contains:fitness', 'occasion:health']);

    migrate();

    expect(tagsOf('transactions', 'no-venue')).toEqual(['contains:fitness', 'occasion:health']);
  });

  it("leaves another merchant's venue:club alone", () => {
    txn('real-club', OTHER, ['venue:club', 'occasion:out']);
    txn('no-entity', null, ['venue:club']);

    migrate();

    expect(tagsOf('transactions', 'real-club')).toEqual(['venue:club', 'occasion:out']);
    expect(tagsOf('transactions', 'no-entity')).toEqual(['venue:club']);
  });

  it('moves the usage counts with the rows, so the prompt stops ranking the wrong value first', () => {
    txn('club-1', GYM, ['venue:club']);
    txn('club-2', GYM, ['venue:club']);
    txn('sauna', GYM, ['venue:sauna']);
    txn('real-club', OTHER, ['venue:club']);

    migrate();

    expect(usage('venue:gym')).toBe(3);
    expect(usage('venue:club')).toBe(8);
    expect(usage('venue:sauna')).toBe(3);
  });

  it('corrects tag rules and correction rules for the entity, and only for it', () => {
    db.prepare(
      'INSERT INTO transaction_tag_rules (id, description_pattern, entity_id, tags) VALUES (?, ?, ?, ?)'
    ).run('rule-gym', 'PLUSFITNESS', GYM, JSON.stringify(['venue:club', 'contains:fitness']));
    db.prepare(
      'INSERT INTO transaction_tag_rules (id, description_pattern, entity_id, tags) VALUES (?, ?, ?, ?)'
    ).run('rule-other', 'PALMS', OTHER, JSON.stringify(['venue:club']));
    db.prepare(
      'INSERT INTO transaction_corrections (id, description_pattern, entity_id, tags) VALUES (?, ?, ?, ?)'
    ).run('corr-gym', 'Plus Fitness', GYM, JSON.stringify(['venue:sauna']));

    migrate();

    expect(tagsOf('transaction_tag_rules', 'rule-gym')).toEqual(['contains:fitness', 'venue:gym']);
    expect(tagsOf('transaction_tag_rules', 'rule-other')).toEqual(['venue:club']);
    expect(tagsOf('transaction_corrections', 'corr-gym')).toEqual(['venue:gym']);
  });

  it('does not double-add gym to a row that already carries it beside a wrong venue', () => {
    txn('both', GYM, ['venue:club', 'venue:gym']);

    migrate();

    expect(tagsOf('transactions', 'both')).toEqual(['venue:gym']);
  });

  it('is a no-op on a second run', () => {
    txn('club', GYM, ['venue:club', 'contains:fitness']);
    txn('real-club', OTHER, ['venue:club']);

    migrate();
    const after = {
      club: tagsOf('transactions', 'club'),
      realClub: tagsOf('transactions', 'real-club'),
      gym: usage('venue:gym'),
      clubUsage: usage('venue:club'),
    };
    migrate();

    expect({
      club: tagsOf('transactions', 'club'),
      realClub: tagsOf('transactions', 'real-club'),
      gym: usage('venue:gym'),
      clubUsage: usage('venue:club'),
    }).toEqual(after);
  });
});
