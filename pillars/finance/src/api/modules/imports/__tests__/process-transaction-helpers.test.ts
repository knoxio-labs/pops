/**
 * Unit tests for the `ProcessedTransaction` builders (CF068/#3649): each
 * classification outcome (matched/uncertain-by-entity, uncertain-from-AI,
 * uncertain-no-match, failed) must carry the right `entity`/`status`/`type`/
 * `error` shape, since these are what the review UI and the commit payload key
 * off.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import {
  buildFailure,
  buildFromEntityMatch,
  buildUncertainFromAi,
  buildUncertainNoMatch,
} from '../process-transaction-helpers.js';

import type { EntityLookupEntry } from '../../../../db/index.js';
import type { ParsedTransaction } from '../types.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-process-transaction-helpers-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function transaction(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    date: '2026-02-13',
    description: 'WOOLWORTHS 1234',
    amount: -42.5,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    ...overrides,
  };
}

const entry: EntityLookupEntry = { id: 'ent-1', name: 'Woolworths' };

describe('buildFromEntityMatch', () => {
  it('builds a matched purchase for a debit with a resolved entity, no confidence', () => {
    const result = buildFromEntityMatch(db, {
      transaction: transaction(),
      entry,
      matchType: 'exact',
      knownTags: [],
      entityDefaultTags: new Map(),
    });

    expect(result.status).toBe('matched');
    expect(result.transactionType).toBe('purchase');
    expect(result.entity).toEqual({
      entityId: 'ent-1',
      entityName: 'Woolworths',
      matchType: 'exact',
    });
  });

  it('leaves a credit uncertain with NO defaulted type, even when the entity resolves', () => {
    // A positive-amount entity match (e.g. a salary from a matched employer)
    // must not silently commit as a purchase — the default-type policy (#3607)
    // surfaces it for review, still carrying the matched entity.
    const result = buildFromEntityMatch(db, {
      transaction: transaction({ amount: 1500, description: 'ACME PAYROLL' }),
      entry,
      matchType: 'exact',
      knownTags: [],
      entityDefaultTags: new Map(),
    });

    expect(result.status).toBe('uncertain');
    expect(result.transactionType).toBeUndefined();
    expect(result.entity).toEqual({
      entityId: 'ent-1',
      entityName: 'Woolworths',
      matchType: 'exact',
    });
  });

  it('carries confidence only for an AI match', () => {
    const result = buildFromEntityMatch(db, {
      transaction: transaction(),
      entry,
      matchType: 'ai',
      confidence: 0.83,
      knownTags: [],
      entityDefaultTags: new Map(),
    });

    expect(result.entity).toEqual({
      entityId: 'ent-1',
      entityName: 'Woolworths',
      matchType: 'ai',
      confidence: 0.83,
    });
  });

  it('omits confidence for a non-AI match even when a confidence value is supplied', () => {
    const result = buildFromEntityMatch(db, {
      transaction: transaction(),
      entry,
      matchType: 'exact',
      confidence: 0.5,
      knownTags: [],
      entityDefaultTags: new Map(),
    });

    expect(result.entity).toEqual({
      entityId: 'ent-1',
      entityName: 'Woolworths',
      matchType: 'exact',
    });
  });
});

describe('buildUncertainFromAi', () => {
  it('builds an uncertain row carrying the AI-suggested entity name + confidence, no entityId', () => {
    const result = buildUncertainFromAi(db, {
      transaction: transaction(),
      entityName: 'Unknown Merchant Pty Ltd',
      aiTags: ['groceries'],
      aiCategory: null,
      confidence: 0.4,
      knownTags: [],
    });

    expect(result.status).toBe('uncertain');
    expect(result.entity).toEqual({
      entityName: 'Unknown Merchant Pty Ltd',
      matchType: 'ai',
      confidence: 0.4,
    });
  });
});

describe('buildUncertainNoMatch', () => {
  it('builds an uncertain row with matchType none and the given reason as the error', () => {
    const result = buildUncertainNoMatch(db, transaction(), 'No entity match found', []);

    expect(result.status).toBe('uncertain');
    expect(result.entity).toEqual({ matchType: 'none' });
    expect(result.error).toBe('No entity match found');
  });

  it('carries the AI-outage reason through unchanged', () => {
    const result = buildUncertainNoMatch(db, transaction(), 'AI categorization unavailable', []);
    expect(result.error).toBe('AI categorization unavailable');
  });
});

describe('buildFailure', () => {
  it('builds a failed row with matchType none and a formatted error message', () => {
    const { failed, message, errorEntry } = buildFailure(
      transaction({ description: 'BAD ROW' }),
      new Error('insert failed: UNIQUE constraint')
    );

    expect(failed.status).toBe('failed');
    expect(failed.entity).toEqual({ matchType: 'none' });
    expect(failed.error).toBe('insert failed: UNIQUE constraint');
    expect(message).toBe('insert failed: UNIQUE constraint');
    expect(errorEntry.description).toBe('BAD ROW');
    expect(errorEntry.error).toContain('insert failed: UNIQUE constraint');
  });

  it('falls back to "Unknown error" for a non-Error thrown value', () => {
    const { failed, message } = buildFailure(transaction(), 'a string was thrown');

    expect(message).toBe('Unknown error');
    expect(failed.error).toBe('Unknown error');
  });

  it('truncates a long description to 50 chars in the error entry', () => {
    const longDescription = 'X'.repeat(80);
    const { errorEntry } = buildFailure(
      transaction({ description: longDescription }),
      new Error('boom')
    );

    expect(errorEntry.description).toHaveLength(50);
  });
});
