/**
 * Regression tests for CF022 (#3628) — tag-rule matching normalization and
 * priority ordering — and CF020 (#3626) — tag-rule usage telemetry.
 *
 * `findMatchingTagRules`'s regex branch used to test the raw description
 * while exact/contains tested the normalized one, so a digit-bearing
 * description could match under exact/contains and silently miss under
 * regex. `priority` was read by no matcher, so the column was decorative.
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

describe('findMatchingTagRules — regex matches the normalized description', () => {
  it('fires a digit-anchored regex against a digit-bearing description (CF022)', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: '^WOOLWORTHS SYDNEY$',
      matchType: 'regex',
      tags: ['Groceries'],
    });

    // Raw description carries a bank-inserted card-ref digit run the anchored
    // regex would never match; the normalizer strips it before matching.
    const rows = findMatchingTagRules(db, 'Woolworths 1234 Sydney', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tags).toBe(JSON.stringify(['Groceries']));
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
