/**
 * Unit tests for `applyLearnedCorrection` (CF068/#3649): the highest-priority
 * matching correction rule must classify a transaction identically whether it
 * comes from the in-memory `rules` override (pending-rule re-evaluation) or
 * the live DB fetch (real import), and the entity/entity-less, confidence,
 * and transaction-type branches must each route to the right bucket.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactionCorrections,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { applyLearnedCorrection } from '../apply-learned-correction.js';

import type { CorrectionRow } from '../../corrections/index.js';
import type { ParsedTransaction } from '../types.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-apply-learned-correction-test-'));
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
    description: 'SPOTIFY AB SYDNEY',
    amount: -12.99,
    account: 'Amex',
    rawRow: '{}',
    checksum: crypto.randomUUID(),
    ...overrides,
  };
}

function rule(overrides: Partial<CorrectionRow> = {}): CorrectionRow {
  return {
    id: 'rule-1',
    descriptionPattern: 'SPOTIFY',
    matchType: 'contains',
    entityId: 'ent-spotify',
    entityName: 'Spotify',
    location: null,
    tags: '[]',
    transactionType: null,
    isActive: true,
    confidence: 0.95,
    priority: 0,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...overrides,
  };
}

function seedRule(input: CorrectionRow): void {
  db.insert(transactionCorrections)
    .values({
      id: input.id,
      descriptionPattern: input.descriptionPattern,
      matchType: input.matchType,
      entityId: input.entityId,
      entityName: input.entityName,
      location: input.location,
      transactionType: input.transactionType,
      tags: input.tags,
      isActive: input.isActive,
      confidence: input.confidence,
      priority: input.priority,
    })
    .run();
}

describe('applyLearnedCorrection — no match', () => {
  it('returns null when no rule matches the description (in-memory rules)', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction({ description: 'WOOLWORTHS 1234' }),
      minConfidence: 0.7,
      knownTags: [],
      rules: [rule()],
    });
    expect(result).toBeNull();
  });

  it('returns null when no rule matches the description (DB fetch)', () => {
    seedRule(rule());
    const result = applyLearnedCorrection(db, {
      transaction: transaction({ description: 'WOOLWORTHS 1234' }),
      minConfidence: 0.7,
      knownTags: [],
    });
    expect(result).toBeNull();
  });
});

describe('applyLearnedCorrection — entity-bearing rule', () => {
  it('matches high confidence to "matched", carrying entity + ruleProvenance', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [rule({ confidence: 0.95 })],
    });

    expect(result?.bucket).toBe('matched');
    expect(result?.processed.entity).toEqual({
      entityId: 'ent-spotify',
      entityName: 'Spotify',
      matchType: 'learned',
      confidence: 0.95,
    });
    expect(result?.processed.ruleProvenance).toEqual({
      source: 'correction',
      ruleId: 'rule-1',
      pattern: 'SPOTIFY',
      matchType: 'contains',
      confidence: 0.95,
    });
    expect(result?.processed.matchedRules).toEqual([
      {
        ruleId: 'rule-1',
        pattern: 'SPOTIFY',
        matchType: 'contains',
        confidence: 0.95,
        priority: 0,
        entityId: 'ent-spotify',
        entityName: 'Spotify',
      },
    ]);
  });

  it('routes sub-threshold confidence to "uncertain" (below HIGH_CONFIDENCE_THRESHOLD)', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [rule({ confidence: 0.75 })],
    });

    expect(result?.bucket).toBe('uncertain');
    expect(result?.processed.status).toBe('uncertain');
  });

  it('produces the identical bucket + entity via a DB-seeded rule as via the in-memory rules override (parity)', () => {
    seedRule(rule({ confidence: 0.95 }));

    const fromDb = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
    });
    const fromRules = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [rule({ confidence: 0.95 })],
    });

    expect(fromDb?.bucket).toBe(fromRules?.bucket);
    expect(fromDb?.processed.entity).toEqual(fromRules?.processed.entity);
    expect(fromDb?.processed.status).toEqual(fromRules?.processed.status);
  });

  it('ignores an inactive rule when fetched from the DB', () => {
    seedRule(rule({ isActive: false }));
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
    });
    expect(result).toBeNull();
  });

  it('picks the lower priority-number rule when multiple rules match (priority ASC, rank 0 wins)', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [
        rule({ id: 'rank-10', priority: 10, entityName: 'Rank Ten Co' }),
        rule({ id: 'rank-0', priority: 0, entityName: 'Rank Zero Co' }),
      ],
    });

    expect(result?.processed.ruleProvenance?.ruleId).toBe('rank-0');
    expect(result?.processed.entity.entityName).toBe('Rank Zero Co');
  });
});

describe('applyLearnedCorrection — entity-less rules', () => {
  it('routes an entity-less purchase rule to "uncertain" regardless of confidence (a merchant is still required)', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [
        rule({ entityId: null, entityName: null, transactionType: 'purchase', confidence: 0.99 }),
      ],
    });

    expect(result?.bucket).toBe('uncertain');
    expect(result?.processed.entity).toEqual({ matchType: 'learned', confidence: 0.99 });
    expect(result?.processed.transactionType).toBe('purchase');
  });

  it('routes a high-confidence entity-less transfer rule to "matched", setting transactionType', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [
        rule({ entityId: null, entityName: null, transactionType: 'transfer', confidence: 0.95 }),
      ],
    });

    expect(result?.bucket).toBe('matched');
    expect(result?.processed.transactionType).toBe('transfer');
  });

  it('routes a low-confidence entity-less transfer rule to "uncertain"', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [
        rule({ entityId: null, entityName: null, transactionType: 'transfer', confidence: 0.75 }),
      ],
    });

    expect(result?.bucket).toBe('uncertain');
  });

  it('returns null for a rule with neither an entity nor a transaction type (nothing to apply)', () => {
    const result = applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: [rule({ entityId: null, entityName: null, transactionType: null })],
    });

    expect(result).toBeNull();
  });
});

describe('applyLearnedCorrection — usage telemetry gated by isPreview, not by rules (CF040/#3664)', () => {
  function timesApplied(id: string): number {
    const row = db
      .select()
      .from(transactionCorrections)
      .where(eq(transactionCorrections.id, id))
      .get();
    if (!row) throw new Error(`rule ${id} vanished`);
    return row.timesApplied;
  }

  it('bumps timesApplied on a live DB fetch (rules omitted)', () => {
    seedRule(rule({ id: 'r-1' }));

    applyLearnedCorrection(db, { transaction: transaction(), minConfidence: 0.7, knownTags: [] });

    expect(timesApplied('r-1')).toBe(1);
  });

  it('bumps timesApplied when a fetch-once-per-run rules array is supplied without isPreview', () => {
    seedRule(rule({ id: 'r-1' }));
    const fetchedOnce = [rule({ id: 'r-1' })];

    applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: fetchedOnce,
    });

    expect(timesApplied('r-1')).toBe(1);
  });

  it('does NOT bump timesApplied when rules is a pending-ChangeSet preview (isPreview: true)', () => {
    seedRule(rule({ id: 'r-1' }));
    const previewRules = [rule({ id: 'r-1' })];

    applyLearnedCorrection(db, {
      transaction: transaction(),
      minConfidence: 0.7,
      knownTags: [],
      rules: previewRules,
      isPreview: true,
    });

    expect(timesApplied('r-1')).toBe(0);
  });
});
