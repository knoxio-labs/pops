/**
 * Regression tests for the read-only tag-rule data-hygiene audit
 * (CF060/#3650): duplicate/contradictory active rules sharing a normalized
 * `(descriptionPattern, matchType)`, and active rules whose pattern matches
 * none of the transactions currently in the table.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  findDuplicateTransactionTagRules,
  findUnreachableTransactionTagRules,
} from '../services/transaction-tag-rules-audit.js';

import type { FinanceDb } from '../services/internal.js';

const DDL = `
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  match_type text DEFAULT 'exact' NOT NULL,
  entity_id text,
  tags text DEFAULT '[]' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  confidence real DEFAULT 0.5 NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  times_applied integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  last_used_at text
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  account text NOT NULL,
  amount real NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  entity_id text,
  entity_name text,
  location text,
  country text,
  related_transaction_id text,
  notes text,
  checksum text,
  raw_row text,
  last_edited_time text NOT NULL,
  match_type text,
  match_rule_id text,
  match_confidence real
);
`;

interface TestHarness {
  db: FinanceDb;
  raw: Database.Database;
}

function freshDb(): TestHarness {
  const raw = new Database(':memory:');
  raw.exec(DDL);
  return { db: drizzle(raw), raw };
}

function seedRule(
  harness: TestHarness,
  overrides: Partial<{
    id: string;
    descriptionPattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    entityId: string | null;
    isActive: 0 | 1;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();
  harness.raw
    .prepare(
      `INSERT INTO transaction_tag_rules (id, description_pattern, match_type, entity_id, is_active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      id,
      overrides.descriptionPattern ?? 'COLES',
      overrides.matchType ?? 'contains',
      overrides.entityId ?? null,
      overrides.isActive ?? 1
    );
  return id;
}

function seedTransaction(harness: TestHarness, description: string): void {
  harness.raw
    .prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, last_edited_time)
       VALUES (?, ?, 'amex', -10, '2026-01-01', 'Expense', '2026-01-01T00:00:00.000Z')`
    )
    .run(crypto.randomUUID(), description);
}

describe('findDuplicateTransactionTagRules', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns no groups when every active rule has a unique (pattern, matchType)', () => {
    seedRule(harness, { descriptionPattern: 'COLES', matchType: 'contains' });
    seedRule(harness, { descriptionPattern: 'ALDI', matchType: 'contains' });
    expect(findDuplicateTransactionTagRules(harness.db)).toEqual([]);
  });

  it('groups two active rules sharing a pattern + matchType even with different entityIds', () => {
    seedRule(harness, {
      descriptionPattern: 'K MART',
      matchType: 'contains',
      entityId: 'ent-valid',
    });
    seedRule(harness, {
      descriptionPattern: 'K MART',
      matchType: 'contains',
      entityId: 'temp:entity:orphan',
    });

    const groups = findDuplicateTransactionTagRules(harness.db);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.descriptionPattern).toBe('K MART');
    expect(groups[0]?.matchType).toBe('contains');
    expect(groups[0]?.rules).toHaveLength(2);
  });

  it('groups un-normalized case/digit variants of the same pattern (legacy drift)', () => {
    seedRule(harness, { descriptionPattern: 'K MART', matchType: 'contains', entityId: 'ent-a' });
    seedRule(harness, {
      descriptionPattern: 'k mart 42',
      matchType: 'contains',
      entityId: 'ent-b',
    });

    const groups = findDuplicateTransactionTagRules(harness.db);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.descriptionPattern).toBe('K MART');
    expect(groups[0]?.rules).toHaveLength(2);
  });

  it('does not normalize regex patterns when grouping (metacharacters must survive)', () => {
    seedRule(harness, { descriptionPattern: '\\bcoles\\b', matchType: 'regex', entityId: 'ent-a' });
    seedRule(harness, { descriptionPattern: '\\bCOLES\\b', matchType: 'regex', entityId: 'ent-b' });
    expect(findDuplicateTransactionTagRules(harness.db)).toEqual([]);
  });

  it('does not group rules with the same pattern but a different matchType', () => {
    seedRule(harness, { descriptionPattern: 'COLES', matchType: 'contains' });
    seedRule(harness, { descriptionPattern: 'COLES', matchType: 'exact' });
    expect(findDuplicateTransactionTagRules(harness.db)).toEqual([]);
  });

  it('ignores an inactive duplicate — only active rules can collide at match time', () => {
    seedRule(harness, { descriptionPattern: 'COLES', matchType: 'contains', isActive: 1 });
    seedRule(harness, { descriptionPattern: 'COLES', matchType: 'contains', isActive: 0 });
    expect(findDuplicateTransactionTagRules(harness.db)).toEqual([]);
  });
});

describe('findUnreachableTransactionTagRules', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns [] when the transactions table is empty', () => {
    seedRule(harness, { descriptionPattern: 'COLES', matchType: 'contains' });
    expect(findUnreachableTransactionTagRules(harness.db)).toEqual([]);
  });

  it('flags an active rule whose pattern matches no live transaction description', () => {
    seedTransaction(harness, 'COLES SYDNEY 1234');
    const deadId = seedRule(harness, { descriptionPattern: 'HUNGRY JACKS', matchType: 'contains' });

    const unreachable = findUnreachableTransactionTagRules(harness.db);
    expect(unreachable.map((r) => r.id)).toEqual([deadId]);
  });

  it('does not flag a rule that matches at least one live transaction description', () => {
    seedTransaction(harness, 'COLES SYDNEY 1234');
    seedRule(harness, { descriptionPattern: 'COLES', matchType: 'contains' });
    expect(findUnreachableTransactionTagRules(harness.db)).toEqual([]);
  });

  it('ignores an inactive rule entirely (neither flagged nor cleared by live data)', () => {
    seedTransaction(harness, 'COLES SYDNEY 1234');
    seedRule(harness, { descriptionPattern: 'HUNGRY JACKS', matchType: 'contains', isActive: 0 });
    expect(findUnreachableTransactionTagRules(harness.db)).toEqual([]);
  });
});
