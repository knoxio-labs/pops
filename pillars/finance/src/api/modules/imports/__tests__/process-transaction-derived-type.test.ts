/**
 * The descriptor stage of the classification ladder (POPS-2610).
 *
 * A fee has no merchant, so before this stage existed the entity matcher found
 * nothing, the row fell through to the AI, and it landed in the uncertain
 * bucket untyped — which is how an untagged `CHARGE FOR OVERDUE PAYMENT` became
 * invisible to a fee report. What is pinned here: the row is typed and matched
 * without any AI call, it carries exactly one `fee:` value, and an ordinary
 * merchant still reaches the AI stage untouched.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { classifyWithoutAi } from '../process-transaction.js';
import { createAiCounters } from '../types.js';

import type { CorrectionRow } from '../../corrections/index.js';
import type { ParsedTransaction, ProcessContext } from '../types.js';

const { categorizeWithAi, isAiCategorizerEnabled } = vi.hoisted(() => ({
  categorizeWithAi: vi.fn(),
  isAiCategorizerEnabled: vi.fn(),
}));

vi.mock('../ai-categorizer.js', () => ({
  categorizeWithAi,
  isAiCategorizerEnabled,
  toCategorizerInput: (t: ParsedTransaction) => ({ description: t.description }),
}));

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

function makeTransaction(description: string, amount = -126.21): ParsedTransaction {
  return {
    date: '2026-05-10',
    description,
    amount,
    account: 'amex',
    rawRow: description,
    checksum: crypto.randomUUID(),
  };
}

function makeContext(correctionRules: CorrectionRow[] = []): ProcessContext {
  return {
    entityLookup: new Map(),
    aliases: new Map(),
    knownTags: [],
    importBatchId: 'batch-1',
    entityDefaultTags: new Map(),
    correctionRules,
  };
}

function classify(description: string, amount?: number, correctionRules?: CorrectionRow[]) {
  return classifyWithoutAi({
    db,
    transaction: makeTransaction(description, amount),
    context: makeContext(correctionRules),
    counters: createAiCounters(),
  });
}

beforeEach(() => {
  isAiCategorizerEnabled.mockReturnValue(true);
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-derived-type-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('classifyWithoutAi — descriptor-derived types', () => {
  it('types an interest charge as a fee, matched, with one fee: value', () => {
    const staged = classify('INTEREST CHARGES');

    expect(staged.kind).toBe('resolved');
    const matched = staged.kind === 'resolved' ? staged.result.matched : undefined;
    expect(matched?.status).toBe('matched');
    expect(matched?.transactionType).toBe('fee');
    expect(matched?.suggestedTags?.map((s) => s.tag)).toEqual(['fee:interest']);
    expect(matched?.entity).toEqual({ matchType: 'none' });
  });

  it('types the row nobody tagged', () => {
    const staged = classify('CHARGE FOR OVERDUE PAYMENT', -30);

    const matched = staged.kind === 'resolved' ? staged.result.matched : undefined;
    expect(matched?.transactionType).toBe('fee');
    expect(matched?.suggestedTags?.map((s) => s.tag)).toEqual(['fee:late']);
  });

  it('types a $0 fee row like any other', () => {
    const staged = classify('ANNUAL FEE', 0);

    const matched = staged.kind === 'resolved' ? staged.result.matched : undefined;
    expect(matched?.transactionType).toBe('fee');
    expect(matched?.suggestedTags?.map((s) => s.tag)).toEqual(['fee:membership']);
  });

  it('types an inbound account payment as a transfer with no fee: value', () => {
    const staged = classify('PayID Payment Received, Thank you', 500);

    const matched = staged.kind === 'resolved' ? staged.result.matched : undefined;
    expect(matched?.transactionType).toBe('transfer');
    expect(matched?.suggestedTags ?? []).toEqual([]);
  });

  it('leaves an ordinary merchant to the entity matcher and the AI', () => {
    expect(classify('FEE STREET CAFE', -8.5).kind).toBe('needsAi');
    expect(classify('WOOLWORTHS METRO 1234', -55).kind).toBe('needsAi');
  });

  it("yields to the user's own correction rule, which sits above it in the ladder", () => {
    const rule: CorrectionRow = {
      id: 'rule-1',
      descriptionPattern: 'INTEREST CHARGES',
      matchType: 'contains',
      entityId: null,
      entityName: null,
      location: null,
      tags: '["contains:banking"]',
      transactionType: 'purchase',
      isActive: true,
      confidence: 0.95,
      priority: 0,
      timesApplied: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: null,
    };

    const staged = classify('INTEREST CHARGES', -126.21, [rule]);

    const processed =
      staged.kind === 'resolved' ? (staged.result.matched ?? staged.result.uncertain) : undefined;
    expect(processed?.transactionType).toBe('purchase');
    expect(processed?.entity?.matchType).toBe('learned');
    expect(processed?.suggestedTags?.map((s) => s.tag)).not.toContain('fee:interest');
  });

  it('never calls the AI for a descriptor it can type itself', () => {
    classify('INTEREST CHARGES');
    classify('MEMBERSHIP FEE', -450);

    expect(categorizeWithAi).not.toHaveBeenCalled();
  });
});
