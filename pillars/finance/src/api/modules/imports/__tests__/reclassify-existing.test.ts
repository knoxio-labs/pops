/**
 * Regression tests for the retroactive reclassification gate (CF006, #3612).
 *
 * `reclassifyExistingTransactions` must mirror the live-import classification
 * gate: only high-confidence, review-free matches are written, and an
 * entity-less rule must never clear a transaction's already-assigned entity.
 * These cases pin the exact failures the finance audit found.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactionCorrections,
  transactions,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import {
  applyCorrectionRuleToExistingTransactions,
  reclassifyExistingTransactions,
} from '../reclassify-existing.js';

interface SeedTxn {
  description: string;
  type: string;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  matchType?: 'manual' | null;
}

interface SeedRule {
  descriptionPattern: string;
  confidence: number;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

function seedTxn(input: SeedTxn): string {
  const id = crypto.randomUUID();
  db.insert(transactions)
    .values({
      id,
      description: input.description,
      account: 'amex',
      amountCents: -1250,
      date: '2026-01-01',
      type: input.type,
      tags: JSON.stringify(input.tags ?? []),
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      matchType: input.matchType ?? null,
      checksum: null,
      lastEditedTime: '2026-01-01T00:00:00.000Z',
    })
    .run();
  return id;
}

function seedRule(input: SeedRule): string {
  const id = crypto.randomUUID();
  db.insert(transactionCorrections)
    .values({
      id,
      descriptionPattern: input.descriptionPattern,
      matchType: 'exact',
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      transactionType: input.transactionType ?? null,
      tags: JSON.stringify(input.tags ?? []),
      isActive: true,
      confidence: input.confidence,
      priority: 0,
    })
    .run();
  return id;
}

function readTxn(id: string) {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new Error(`transaction ${id} vanished`);
  return row;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-reclassify-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('reclassifyExistingTransactions — classification gate (CF006)', () => {
  it('skips a sub-threshold (<0.9) entity match rather than applying it unreviewed', () => {
    const txnId = seedTxn({ description: 'COFFEE SHOP', type: 'purchase', entityId: null });
    seedRule({
      descriptionPattern: 'COFFEE SHOP',
      entityId: 'ent-coffee',
      entityName: 'Coffee Co',
      transactionType: 'purchase',
      confidence: 0.8,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(0);
    const row = readTxn(txnId);
    expect(row.entityId).toBeNull();
    expect(row.entityName).toBeNull();
    expect(row.type).toBe('purchase');
  });

  it('never clears an existing entity: an entity-less transfer rule retypes but keeps the merchant', () => {
    const txnId = seedTxn({
      description: 'TRANSFER TO SAVINGS',
      type: 'purchase',
      entityId: 'ent-existing',
      entityName: 'My Bank',
      location: null,
    });
    seedRule({
      descriptionPattern: 'TRANSFER TO SAVINGS',
      entityId: null,
      entityName: null,
      location: 'AU',
      transactionType: 'transfer',
      confidence: 0.95,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(1);
    const row = readTxn(txnId);
    expect(row.type).toBe('transfer');
    expect(row.location).toBe('AU');
    expect(row.entityId).toBe('ent-existing');
    expect(row.entityName).toBe('My Bank');
  });

  it('treats a whitespace-only entityId as entity-less: never overwrites a merchant with a blank id', () => {
    const txnId = seedTxn({
      description: 'TRANSFER TO SAVINGS',
      type: 'purchase',
      entityId: 'ent-existing',
      entityName: 'My Bank',
    });
    seedRule({
      descriptionPattern: 'TRANSFER TO SAVINGS',
      entityId: '   ',
      entityName: null,
      transactionType: 'transfer',
      confidence: 0.99,
    });

    reclassifyExistingTransactions(db, []);

    const row = readTxn(txnId);
    expect(row.type).toBe('transfer');
    expect(row.entityId).toBe('ent-existing');
    expect(row.entityName).toBe('My Bank');
  });

  it('applies a confident (>=0.9) entity rule: sets entity and type', () => {
    const txnId = seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.95,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(1);
    const row = readTxn(txnId);
    expect(row.entityId).toBe('ent-woolies');
    expect(row.entityName).toBe('Woolworths');
    expect(row.type).toBe('purchase');
  });

  it('skips an entity-less purchase rule even at high confidence (needs merchant review)', () => {
    const txnId = seedTxn({
      description: 'UNKNOWN MERCHANT',
      type: 'income',
      entityId: null,
      location: null,
    });
    seedRule({
      descriptionPattern: 'UNKNOWN MERCHANT',
      entityId: null,
      location: 'US',
      transactionType: 'purchase',
      confidence: 0.99,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(0);
    const row = readTxn(txnId);
    expect(row.type).toBe('income');
    expect(row.location).toBeNull();
    expect(row.entityId).toBeNull();
  });

  it('skips a sub-threshold entity-less transfer rule (uncertain, not written)', () => {
    const txnId = seedTxn({ description: 'AMBIGUOUS MOVE', type: 'purchase', entityId: null });
    seedRule({
      descriptionPattern: 'AMBIGUOUS MOVE',
      entityId: null,
      transactionType: 'transfer',
      confidence: 0.8,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(0);
    expect(readTxn(txnId).type).toBe('purchase');
  });
});

describe('reclassifyExistingTransactions — manual-override skip (CF017/#3623)', () => {
  it('never touches a transaction whose matchType is "manual", even against a confident matching rule', () => {
    const txnId = seedTxn({
      description: 'WOOLWORTHS',
      type: 'income',
      entityId: 'ent-user-picked',
      entityName: 'User Picked Co',
      matchType: 'manual',
    });
    seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.99,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(0);
    const row = readTxn(txnId);
    expect(row.entityId).toBe('ent-user-picked');
    expect(row.entityName).toBe('User Picked Co');
    expect(row.type).toBe('income');
  });

  it('still reclassifies a sibling row with the same description that was never manually edited', () => {
    const manualId = seedTxn({
      description: 'WOOLWORTHS',
      type: 'income',
      entityId: 'ent-user-picked',
      matchType: 'manual',
    });
    const autoId = seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.99,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(1);
    expect(readTxn(manualId).entityId).toBe('ent-user-picked');
    expect(readTxn(autoId).entityId).toBe('ent-woolies');
  });
});

describe('reclassifyExistingTransactions — idempotent on a second pass', () => {
  it('a second pass against the same rule set makes no further changes', () => {
    seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.95,
    });

    expect(reclassifyExistingTransactions(db, [])).toBe(1);
    expect(reclassifyExistingTransactions(db, [])).toBe(0);
  });
});

describe('reclassifyExistingTransactions — tag-merge + provenance + usage telemetry (#3660 follow-up)', () => {
  function readRule(id: string) {
    const row = db
      .select()
      .from(transactionCorrections)
      .where(eq(transactionCorrections.id, id))
      .get();
    if (!row) throw new Error(`correction ${id} vanished`);
    return row;
  }

  it('merges the winning rule tags into the transaction and stamps match provenance', () => {
    const txnId = seedTxn({
      description: 'WOOLWORTHS',
      type: 'income',
      entityId: null,
      tags: ['existing-tag'],
    });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      tags: ['groceries'],
      confidence: 0.95,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(1);
    const row = readTxn(txnId);
    expect(JSON.parse(row.tags).toSorted()).toEqual(['existing-tag', 'groceries'].toSorted());
    expect(row.matchType).toBe('learned');
    expect(row.matchRuleId).toBe(ruleId);
    expect(row.matchConfidence).toBe(0.95);
  });

  it('bumps the matched rule timesApplied/lastUsedAt by the number of rows it changed in this pass', () => {
    seedTxn({ description: 'WOOLWORTHS 1', type: 'income', entityId: null });
    seedTxn({ description: 'WOOLWORTHS 2', type: 'income', entityId: null });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.95,
    });

    const before = readRule(ruleId);
    expect(before.timesApplied).toBe(0);
    expect(before.lastUsedAt).toBeNull();

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(2);
    const after = readRule(ruleId);
    expect(after.timesApplied).toBe(2);
    expect(after.lastUsedAt).not.toBeNull();
  });

  it('never bumps usage or stamps provenance on a manually-overridden row', () => {
    const txnId = seedTxn({
      description: 'WOOLWORTHS',
      type: 'income',
      entityId: 'ent-user-picked',
      matchType: 'manual',
      tags: ['kept-as-is'],
    });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      tags: ['groceries'],
      confidence: 0.99,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(0);
    const row = readTxn(txnId);
    expect(row.matchType).toBe('manual');
    expect(row.matchRuleId).toBeNull();
    expect(JSON.parse(row.tags)).toEqual(['kept-as-is']);
    expect(readRule(ruleId).timesApplied).toBe(0);
  });

  it('a second pass with nothing left to change writes nothing and bumps no rule usage', () => {
    seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      tags: ['groceries'],
      confidence: 0.95,
    });

    expect(reclassifyExistingTransactions(db, [])).toBe(1);
    expect(readRule(ruleId).timesApplied).toBe(1);

    expect(reclassifyExistingTransactions(db, [])).toBe(0);
    expect(readRule(ruleId).timesApplied).toBe(1);
  });
});

describe('applyCorrectionRuleToExistingTransactions — single-rule retroactive apply (#3660)', () => {
  it('applies only the targeted rule, even when a different rule also matches', () => {
    const txnId = seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    const targetRuleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      tags: ['groceries'],
      confidence: 0.95,
    });

    const result = applyCorrectionRuleToExistingTransactions(db, targetRuleId);

    expect(result).toMatchObject({
      dryRun: false,
      matched: 1,
      updated: 1,
      skippedManual: 0,
      skippedUncertain: 0,
    });
    const row = readTxn(txnId);
    expect(row.entityId).toBe('ent-woolies');
    expect(row.matchRuleId).toBe(targetRuleId);
  });

  it('reports skippedManual and leaves a manually-overridden transaction untouched', () => {
    const txnId = seedTxn({
      description: 'WOOLWORTHS',
      type: 'income',
      entityId: 'ent-user-picked',
      matchType: 'manual',
    });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.95,
    });

    const result = applyCorrectionRuleToExistingTransactions(db, ruleId);

    expect(result).toMatchObject({ matched: 1, updated: 0, skippedManual: 1 });
    expect(readTxn(txnId).entityId).toBe('ent-user-picked');
  });

  it('reports skippedUncertain for a sub-threshold match, applying nothing', () => {
    seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.8,
    });

    const result = applyCorrectionRuleToExistingTransactions(db, ruleId);

    expect(result).toMatchObject({ matched: 1, updated: 0, skippedUncertain: 1 });
  });

  it('dryRun computes the same result without writing anything or bumping usage', () => {
    const txnId = seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.95,
    });

    const result = applyCorrectionRuleToExistingTransactions(db, ruleId, { dryRun: true });

    expect(result).toMatchObject({ dryRun: true, matched: 1, updated: 1 });
    expect(readTxn(txnId).entityId).toBeNull();
    const rule = db
      .select()
      .from(transactionCorrections)
      .where(eq(transactionCorrections.id, ruleId))
      .get();
    expect(rule?.timesApplied).toBe(0);
  });

  it('a second real apply is a no-op (idempotent)', () => {
    seedTxn({ description: 'WOOLWORTHS', type: 'income', entityId: null });
    const ruleId = seedRule({
      descriptionPattern: 'WOOLWORTHS',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      confidence: 0.95,
    });

    expect(applyCorrectionRuleToExistingTransactions(db, ruleId).updated).toBe(1);
    expect(applyCorrectionRuleToExistingTransactions(db, ruleId)).toMatchObject({
      matched: 1,
      updated: 0,
    });
  });

  it('throws TransactionCorrectionNotFoundError for an unknown rule id', () => {
    expect(() => applyCorrectionRuleToExistingTransactions(db, 'nope')).toThrow();
  });
});
