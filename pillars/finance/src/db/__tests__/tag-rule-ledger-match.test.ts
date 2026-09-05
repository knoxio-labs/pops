/**
 * Invariant tests for `tagRuleLedgerMatchStatus` / `loadTagRuleLedgerSnapshot`
 * — the server-side half of POPS-2941: whether a stored tag rule's pattern
 * matches anything in the ledger, and the three-way distinction (matched /
 * unused / broken) the Tag Rules browser badges on.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { dollarsToCents } from '../../money.js';
import {
  loadTagRuleLedgerSnapshot,
  tagRuleLedgerMatchStatus,
} from '../services/tag-rule-ledger-match.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type Database from 'better-sqlite3';

import type { TagRuleForLedgerMatch } from '../services/tag-rule-ledger-match.js';
import type { MigratedFinanceDb } from './migrated-db.js';

interface SeedOverrides {
  id?: string;
  description: string;
  entityId?: string | null;
}

let seq = 0;
function seedTransaction(raw: Database.Database, o: SeedOverrides): void {
  seq += 1;
  const id = o.id ?? `txn-${seq}`;
  const accountId = raw
    .prepare(`SELECT id FROM accounts WHERE name = ? COLLATE NOCASE`)
    .get('Amex') as { id: string } | undefined;
  if (!accountId) throw new Error("No seeded account named 'Amex' — did 0083_accounts.sql run?");
  raw
    .prepare(
      `INSERT INTO transactions (
        id, description, account_id, amount_cents, date, type, checksum, entity_id, last_edited_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      o.description,
      accountId.id,
      dollarsToCents(-10),
      '2025-01-01',
      'Purchase',
      `sum-${seq}`,
      o.entityId ?? null,
      '2025-01-01T00:00:00.000Z'
    );
}

function rule(overrides: Partial<TagRuleForLedgerMatch>): TagRuleForLedgerMatch {
  return {
    descriptionPattern: 'WOOLWORTHS',
    matchType: 'contains',
    entityId: null,
    ...overrides,
  };
}

describe('tagRuleLedgerMatchStatus', () => {
  let harness: MigratedFinanceDb;
  beforeEach(() => {
    harness = freshMigratedFinanceDb();
  });

  it('reports "matched" when the pattern matches at least one transaction', () => {
    seedTransaction(harness.raw, { description: 'WOOLWORTHS 1234 SYDNEY' });
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(tagRuleLedgerMatchStatus(rule({ descriptionPattern: 'WOOLWORTHS' }), snapshot)).toBe(
      'matched'
    );
  });

  it('runs the real predicate, not a substring reimplementation — post-normalisation match required', () => {
    // "MICROSOFT STORE" is not a substring of "MICROSOFT*STORE" until both
    // sides are run through the shared normaliser (POPS-2758's failure shape).
    seedTransaction(harness.raw, { description: 'MICROSOFT*STORE', entityId: 'ent-microsoft' });
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(
      tagRuleLedgerMatchStatus(
        rule({ descriptionPattern: 'MICROSOFT STORE', entityId: 'ent-microsoft' }),
        snapshot
      )
    ).toBe('broken');
  });

  it('reports "unused", never "broken", for an unscoped rule against a full ledger — the write path accepts exactly this rule', () => {
    // createOrReinforceTransactionTagRule deliberately admits a well-formed
    // unscoped pattern that matches nothing today, because a rule written
    // ahead of a merchant's first import is legitimate. Badging it dead here
    // would contradict the write path that let it through — and since a real
    // ledger is never empty, that would be the common case, not an edge one.
    seedTransaction(harness.raw, { description: 'COLES 5678' });
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(
      tagRuleLedgerMatchStatus(rule({ descriptionPattern: 'NEVERGONNAMATCH' }), snapshot)
    ).toBe('unused');
  });

  it('does not badge an unscoped rule as broken however many unrelated entities the ledger holds', () => {
    seedTransaction(harness.raw, { description: 'COLES 5678', entityId: 'ent-coles' });
    seedTransaction(harness.raw, { description: 'WOOLWORTHS 11', entityId: 'ent-woolies' });
    seedTransaction(harness.raw, { description: 'ALDI 22', entityId: 'ent-aldi' });
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(
      tagRuleLedgerMatchStatus(rule({ descriptionPattern: 'BRAND NEW MERCHANT' }), snapshot)
    ).toBe('unused');
  });

  it('reports "unused" for an unscoped rule when the ledger is empty', () => {
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(tagRuleLedgerMatchStatus(rule({ descriptionPattern: 'ANYTHING' }), snapshot)).toBe(
      'unused'
    );
  });

  it('reports "unused" (not "broken") for a rule scoped to an entity with no transactions yet — the legitimate ahead-of-time case', () => {
    // The ledger is non-empty, but nothing in it belongs to this rule's
    // entity — a rule written ahead of that merchant's first import.
    seedTransaction(harness.raw, { description: 'COLES 5678', entityId: 'ent-coles' });
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(
      tagRuleLedgerMatchStatus(
        rule({ descriptionPattern: 'BRAND NEW MERCHANT', entityId: 'ent-new' }),
        snapshot
      )
    ).toBe('unused');
  });

  it('reports "broken" for a rule scoped to an entity that HAS transactions, none of which match', () => {
    seedTransaction(harness.raw, {
      description: 'IMPERIAL HOTEL ERSKIN ERSKINEVILLE',
      entityId: 'ent-imperial',
    });
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(
      tagRuleLedgerMatchStatus(
        rule({ descriptionPattern: 'IMPERIAL HOTEL ERSKINEVILLE', entityId: 'ent-imperial' }),
        snapshot
      )
    ).toBe('broken');
  });

  it('is not fooled by an archived-looking row that is still present — the whole ledger counts, not just active rows', () => {
    // previewRuleMatchTransactions and this snapshot both fetch every
    // transactions row unconditionally; there is no soft-delete/archive flag
    // on the table to filter on, so a present-but-old row still counts as a
    // match (POPS-2696's "whole ledger, not a window" lesson).
    seedTransaction(harness.raw, { description: 'OLD SPOTIFY CHARGE', entityId: 'ent-spotify' });
    const snapshot = loadTagRuleLedgerSnapshot(harness.db);

    expect(
      tagRuleLedgerMatchStatus(
        rule({ descriptionPattern: 'SPOTIFY', entityId: 'ent-spotify' }),
        snapshot
      )
    ).toBe('matched');
  });
});
