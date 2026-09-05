/**
 * POPS-2593 — account-scoped correction rules.
 *
 * `transaction_corrections` matched on description alone, so two banks that
 * post an identical description (`LATE FEE` from both Bank A and Bank B)
 * fought over one rule: whichever sorted first stamped ITS entity on both
 * rows, and hand-correcting one taught the engine the mirror-image wrong
 * answer. No string-shaped pattern separates two identical strings.
 *
 * These tests run against the real migration journal (`freshMigratedFinanceDb`)
 * rather than an inline DDL literal, so the `0094` column and its FK are
 * exercised as they will exist in production.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accounts, transactionCorrections } from '../schema.js';
import {
  createOrUpdateTransactionCorrection,
  findAllMatchingTransactionCorrections,
  findAllMatchingTransactionCorrectionsFromDb,
  updateTransactionCorrection,
} from '../services/transaction-corrections.js';
import { freshMigratedFinanceDb, type MigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

const BANK_A = 'acct-bank-a';
const BANK_B = 'acct-bank-b';

let harness: MigratedFinanceDb;
let db: FinanceDb;

function seedAccount(id: string, name: string): void {
  db.insert(accounts).values({ id, name, kind: 'credit-card', currency: 'AUD' }).run();
}

/**
 * Insert a rule directly, bypassing the service, so a test can plant exactly
 * the row it means to — including confidence/priority combinations the create
 * path would not produce on its own.
 */
function seedRule(overrides: {
  id: string;
  descriptionPattern: string;
  accountId?: string | null;
  entityId: string;
  entityName: string;
  priority?: number;
  confidence?: number;
  tags?: string[];
}): void {
  db.insert(transactionCorrections)
    .values({
      id: overrides.id,
      descriptionPattern: overrides.descriptionPattern,
      accountId: overrides.accountId ?? null,
      matchType: 'exact',
      entityId: overrides.entityId,
      entityName: overrides.entityName,
      tags: JSON.stringify(overrides.tags ?? []),
      isActive: true,
      confidence: overrides.confidence ?? 0.95,
      priority: overrides.priority ?? 0,
    })
    .run();
}

beforeEach(() => {
  harness = freshMigratedFinanceDb();
  db = harness.db;
  seedAccount(BANK_A, 'Bank A Card');
  seedAccount(BANK_B, 'Bank B Card');
});

afterEach(() => {
  harness.raw.close();
});

describe('two accounts posting the same description', () => {
  beforeEach(() => {
    seedRule({
      id: 'rule-a',
      descriptionPattern: 'LATE FEE',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
      tags: ['bank-a-fee'],
    });
    seedRule({
      id: 'rule-b',
      descriptionPattern: 'LATE FEE',
      accountId: BANK_B,
      entityId: 'ent-bank-b',
      entityName: 'Bank B',
      tags: ['bank-b-fee'],
    });
  });

  it('resolves each account to its own rule, entity and tags', () => {
    const onA = findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_A);
    const onB = findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_B);

    expect(onA.map((r) => r.id)).toEqual(['rule-a']);
    expect(onA[0]?.entityId).toBe('ent-bank-a');
    expect(onA[0]?.tags).toBe(JSON.stringify(['bank-a-fee']));

    expect(onB.map((r) => r.id)).toEqual(['rule-b']);
    expect(onB[0]?.entityId).toBe('ent-bank-b');
    expect(onB[0]?.tags).toBe(JSON.stringify(['bank-b-fee']));
  });

  it("never offers one account's rule to the other, even as a losing alternative", () => {
    expect(findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_A)).toHaveLength(1);
    expect(findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_B)).toHaveLength(1);
  });

  it('shows both to a caller with no account in hand (a description-only probe)', () => {
    // A probe must not under-report which rules a string hits; narrowing to
    // global-only would hide every scoped rule from the rule browser.
    expect(
      findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', null)
        .map((r) => r.id)
        .toSorted()
    ).toEqual(['rule-a', 'rule-b']);
  });

  it('applies the same narrowing in the grouped matcher the tag pass uses', () => {
    expect(findAllMatchingTransactionCorrections(db, 'LATE FEE', BANK_A).map((r) => r.id)).toEqual([
      'rule-a',
    ]);
    expect(findAllMatchingTransactionCorrections(db, 'LATE FEE', BANK_B).map((r) => r.id)).toEqual([
      'rule-b',
    ]);
  });
});

describe('precedence against a global rule', () => {
  it('still applies an unscoped rule on an account that has no scoped one', () => {
    seedRule({
      id: 'rule-global',
      descriptionPattern: 'LATE FEE',
      entityId: 'ent-generic',
      entityName: 'Generic Bank',
    });

    for (const accountId of [BANK_A, BANK_B, null]) {
      expect(
        findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', accountId).map((r) => r.id)
      ).toEqual(['rule-global']);
    }
  });

  it('lets the scoped rule win even when the global rule has the lower priority', () => {
    // Priority ASC decides the winner, so priority 0 beats priority 9 on the
    // pre-scope ordering. The scope has to outrank it, or the opt-in never
    // survives contact with the rule set it was created to overrule.
    seedRule({
      id: 'rule-global',
      descriptionPattern: 'LATE FEE',
      entityId: 'ent-generic',
      entityName: 'Generic Bank',
      priority: 0,
    });
    seedRule({
      id: 'rule-scoped',
      descriptionPattern: 'LATE FEE',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
      priority: 9,
    });

    const matches = findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_A);
    expect(matches.map((r) => r.id)).toEqual(['rule-scoped', 'rule-global']);
    expect(matches[0]?.entityId).toBe('ent-bank-a');

    // The other account is untouched by the scoped rule.
    expect(
      findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_B).map((r) => r.id)
    ).toEqual(['rule-global']);
  });

  it('lets the scoped rule win even when the global rule has the higher confidence', () => {
    // The grouped matcher orders by confidence DESC; scope must outrank that
    // key too, not merely the priority one.
    seedRule({
      id: 'rule-global',
      descriptionPattern: 'LATE FEE',
      entityId: 'ent-generic',
      entityName: 'Generic Bank',
      confidence: 1,
    });
    seedRule({
      id: 'rule-scoped',
      descriptionPattern: 'LATE FEE',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
      confidence: 0.75,
    });

    expect(findAllMatchingTransactionCorrections(db, 'LATE FEE', BANK_A).map((r) => r.id)).toEqual([
      'rule-scoped',
      'rule-global',
    ]);
  });
});

describe('the upsert identity', () => {
  it('creates a second row rather than reinforcing the global one', () => {
    const global = createOrUpdateTransactionCorrection(db, {
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      entityId: 'ent-generic',
      entityName: 'Generic Bank',
    });
    const scoped = createOrUpdateTransactionCorrection(db, {
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
    });

    expect(scoped.id).not.toBe(global.id);
    expect(scoped.accountId).toBe(BANK_A);
    // The global rule kept its own entity — it was not overwritten.
    const reread = db
      .select()
      .from(transactionCorrections)
      .where(eq(transactionCorrections.id, global.id))
      .get();
    expect(reread?.entityId).toBe('ent-generic');
    expect(reread?.accountId).toBeNull();
  });

  it('reinforces the row on the same account rather than minting a duplicate', () => {
    const first = createOrUpdateTransactionCorrection(db, {
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
    });
    const second = createOrUpdateTransactionCorrection(db, {
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
    });

    expect(second.id).toBe(first.id);
    expect(second.confidence).toBeGreaterThan(first.confidence);
  });

  it('does not let a scoped create reinforce an unrelated account’s rule', () => {
    const onA = createOrUpdateTransactionCorrection(db, {
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
    });
    const onB = createOrUpdateTransactionCorrection(db, {
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      accountId: BANK_B,
      entityId: 'ent-bank-b',
      entityName: 'Bank B',
    });

    expect(onB.id).not.toBe(onA.id);
    expect(onB.entityId).toBe('ent-bank-b');
  });
});

describe('editing the scope', () => {
  it('narrows a global rule to one account', () => {
    seedRule({
      id: 'rule-1',
      descriptionPattern: 'LATE FEE',
      entityId: 'ent-generic',
      entityName: 'Generic Bank',
    });

    updateTransactionCorrection(db, 'rule-1', { accountId: BANK_A });

    expect(
      findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_A).map((r) => r.id)
    ).toEqual(['rule-1']);
    expect(findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_B)).toEqual([]);
  });

  it('widens a scoped rule back to every account', () => {
    seedRule({
      id: 'rule-1',
      descriptionPattern: 'LATE FEE',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
    });

    updateTransactionCorrection(db, 'rule-1', { accountId: null });

    expect(
      findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', BANK_B).map((r) => r.id)
    ).toEqual(['rule-1']);
  });

  it('leaves the scope alone when the patch omits it', () => {
    seedRule({
      id: 'rule-1',
      descriptionPattern: 'LATE FEE',
      accountId: BANK_A,
      entityId: 'ent-bank-a',
      entityName: 'Bank A',
    });

    const updated = updateTransactionCorrection(db, 'rule-1', { priority: 5 });

    expect(updated.accountId).toBe(BANK_A);
  });

  it('refuses a scope naming an account that does not exist', () => {
    // The scope is a real FK, not free text — POPS-2852 had to re-key the
    // import dedup identity off a bank label for exactly this reason.
    expect(() =>
      createOrUpdateTransactionCorrection(db, {
        descriptionPattern: 'LATE FEE',
        matchType: 'exact',
        accountId: 'no-such-account',
        entityId: 'ent-bank-a',
        entityName: 'Bank A',
      })
    ).toThrow();
  });
});

describe('rules that predate the scope', () => {
  it('leaves a row inserted without an account matching globally', () => {
    // Stands in for every row the 0094 migration touched: it lands on NULL and
    // keeps behaving exactly as it did before the column existed.
    harness.raw
      .prepare(
        `INSERT INTO transaction_corrections
           (id, description_pattern, match_type, entity_id, entity_name, tags, is_active, confidence, priority, times_applied, created_at)
         VALUES ('legacy', 'LATE FEE', 'exact', 'ent-generic', 'Generic Bank', '[]', 1, 0.95, 0, 0, '2020-01-01')`
      )
      .run();

    const row = db
      .select()
      .from(transactionCorrections)
      .where(eq(transactionCorrections.id, 'legacy'))
      .get();
    expect(row?.accountId).toBeNull();

    for (const accountId of [BANK_A, BANK_B, null]) {
      expect(
        findAllMatchingTransactionCorrectionsFromDb(db, 'LATE FEE', accountId).map((r) => r.id)
      ).toEqual(['legacy']);
    }
  });
});
