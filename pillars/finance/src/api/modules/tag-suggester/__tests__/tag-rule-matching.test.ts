/**
 * Regression tests for CF022 (#3628) — tag-rule matching normalization and
 * priority ordering — and CF020 (#3626) — tag-rule usage telemetry.
 *
 * `findMatchingTagRules` used to decide for itself which representation each
 * match type tested against, and decided differently from every other match
 * path (CF022). That decision now belongs to the shared predicate, and the
 * cross-matcher parity suite is what holds every entry point to it.
 * `priority` was read by no matcher, so the column was decorative.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactionTagRulesService,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { suggestTags } from '../index.js';
import { findMatchingTagRules } from '../tag-rule-matching.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-tag-rule-matching-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('findMatchingTagRules — regex matches the raw description', () => {
  it('fires a regex that spells out the card-ref digit run (POPS-2640)', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: '^WOOLWORTHS \\d{4} SYDNEY$',
      matchType: 'regex',
      tags: ['Groceries'],
    });

    const rows = findMatchingTagRules(db, 'Woolworths 1234 Sydney', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tags).toBe(JSON.stringify(['Groceries']));
  });

  it('does not fire a regex anchored to the digit-stripped form', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: '^WOOLWORTHS SYDNEY$',
      matchType: 'regex',
      tags: ['Groceries'],
    });

    expect(findMatchingTagRules(db, 'Woolworths 1234 Sydney', null)).toHaveLength(0);
  });

  it('still lets contains cover every store number with one pattern', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      tags: ['Groceries'],
    });

    expect(findMatchingTagRules(db, 'WOOLWORTHS 1034 CANTERB', null)).toHaveLength(1);
    expect(findMatchingTagRules(db, 'WOOLWORTHS 2201 NEWTOWN', null)).toHaveLength(1);
  });
});

describe('findMatchingTagRules — priority ordering', () => {
  it('orders matches priority ASC (lower priority number wins first)', () => {
    const low = transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'UBER',
      matchType: 'contains',
      tags: ['Rideshare'],
      priority: 5,
    });
    const high = transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'UBER EATS',
      matchType: 'contains',
      tags: ['Eat Out'],
      priority: 1,
    });

    const rows = findMatchingTagRules(db, 'UBER EATS SYDNEY', null);
    expect(rows.map((r) => r.id)).toEqual([high.id, low.id]);
  });
});

describe('findMatchingTagRules — includes the row id', () => {
  it('returns the rule id alongside pattern + tags', () => {
    const created = transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'NETFLIX',
      matchType: 'contains',
      tags: ['Subscriptions'],
    });

    const rows = findMatchingTagRules(db, 'NETFLIX.COM', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(created.id);
  });
});

describe('suggestTags — tag-rule usage telemetry (#3626)', () => {
  it('bumps timesApplied + lastUsedAt on every tag rule that matches', () => {
    const rule = transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'SPOTIFY',
      matchType: 'contains',
      tags: ['Subscriptions'],
    });
    expect(rule.timesApplied).toBe(0);

    suggestTags(db, { description: 'SPOTIFY PREMIUM', entityId: null });

    const after = transactionTagRulesService.getTransactionTagRule(db, rule.id);
    expect(after.timesApplied).toBe(1);
    expect(after.lastUsedAt).not.toBeNull();
  });

  it('does not touch a rule that does not match the description', () => {
    const rule = transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'SPOTIFY',
      matchType: 'contains',
      tags: ['Subscriptions'],
    });

    suggestTags(db, { description: 'TOTALLY UNRELATED MERCHANT', entityId: null });

    const after = transactionTagRulesService.getTransactionTagRule(db, rule.id);
    expect(after.timesApplied).toBe(0);
    expect(after.lastUsedAt).toBeNull();
  });
});
