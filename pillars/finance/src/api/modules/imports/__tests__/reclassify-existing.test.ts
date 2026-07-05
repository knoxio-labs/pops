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
import { reclassifyExistingTransactions } from '../reclassify-existing.js';

interface SeedTxn {
  description: string;
  type: string;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
}

interface SeedRule {
  descriptionPattern: string;
  confidence: number;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
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
      amount: -12.5,
      date: '2026-01-01',
      type: input.type,
      tags: '[]',
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      checksum: null,
      lastEditedTime: '2026-01-01T00:00:00.000Z',
    })
    .run();
  return id;
}

function seedRule(input: SeedRule): void {
  db.insert(transactionCorrections)
    .values({
      id: crypto.randomUUID(),
      descriptionPattern: input.descriptionPattern,
      matchType: 'exact',
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      transactionType: input.transactionType ?? null,
      tags: '[]',
      isActive: true,
      confidence: input.confidence,
      priority: 0,
    })
    .run();
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
    const txnId = seedTxn({ description: 'COFFEE SHOP', type: 'Expense', entityId: null });
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
    expect(row.type).toBe('Expense');
  });

  it('never clears an existing entity: an entity-less transfer rule retypes but keeps the merchant', () => {
    const txnId = seedTxn({
      description: 'TRANSFER TO SAVINGS',
      type: 'Expense',
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
    expect(row.type).toBe('Transfer');
    expect(row.location).toBe('AU');
    expect(row.entityId).toBe('ent-existing');
    expect(row.entityName).toBe('My Bank');
  });

  it('treats a whitespace-only entityId as entity-less: never overwrites a merchant with a blank id', () => {
    const txnId = seedTxn({
      description: 'TRANSFER TO SAVINGS',
      type: 'Expense',
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
    expect(row.type).toBe('Transfer');
    expect(row.entityId).toBe('ent-existing');
    expect(row.entityName).toBe('My Bank');
  });

  it('applies a confident (>=0.9) entity rule: sets entity and type', () => {
    const txnId = seedTxn({ description: 'WOOLWORTHS', type: 'Income', entityId: null });
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
    expect(row.type).toBe('Expense');
  });

  it('skips an entity-less purchase rule even at high confidence (needs merchant review)', () => {
    const txnId = seedTxn({
      description: 'UNKNOWN MERCHANT',
      type: 'Income',
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
    expect(row.type).toBe('Income');
    expect(row.location).toBeNull();
    expect(row.entityId).toBeNull();
  });

  it('skips a sub-threshold entity-less transfer rule (uncertain, not written)', () => {
    const txnId = seedTxn({ description: 'AMBIGUOUS MOVE', type: 'Expense', entityId: null });
    seedRule({
      descriptionPattern: 'AMBIGUOUS MOVE',
      entityId: null,
      transactionType: 'transfer',
      confidence: 0.8,
    });

    const count = reclassifyExistingTransactions(db, []);

    expect(count).toBe(0);
    expect(readTxn(txnId).type).toBe('Expense');
  });
});
