/**
 * POPS-15 — `previewChangeSetImpact`'s full-history mode.
 *
 * Each test here fails against the pre-POPS-15 implementation: there was no
 * `previewChangeSetFullHistory`, and `corrections.previewChangeSet` only ever
 * diffed the caller-supplied `transactions` array (capped at
 * `CALLER_SUPPLIED_TRANSACTIONS_MAX`), so a match lying beyond that array was
 * invisible to the preview however large the caller's list was.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seededAccountId } from '../../../../db/__tests__/seeded-account.js';
import {
  openFinanceDb,
  transactions,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { previewChangeSetFullHistory } from '../preview-full-history.js';

import type { ChangeSet } from '../../../../contract/rest-corrections.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-changeset-full-history-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function insertTransaction(description: string): void {
  db.insert(transactions)
    .values({
      description,
      accountId: seededAccountId(db, 'Amex'),
      amountCents: -1000,
      date: '2026-01-01',
      type: 'purchase',
      lastEditedTime: '2026-01-01T00:00:00.000Z',
    })
    .run();
}

const addCoffeeShopRule: ChangeSet = {
  source: 'test',
  reason: 'test',
  ops: [
    {
      op: 'add',
      data: {
        descriptionPattern: 'COFFEE SHOP',
        matchType: 'contains',
        entityId: 'ent-1',
        entityName: 'Coffee Co',
        tags: [],
      },
    },
  ],
};

describe('previewChangeSetFullHistory', () => {
  it('counts a match lying beyond any caller-supplied list, over the whole DB', () => {
    for (let i = 0; i < 5; i++) insertTransaction(`COFFEE SHOP ${i}`);

    const result = previewChangeSetFullHistory(db, {
      rules: [],
      changeSet: addCoffeeShopRule,
      limit: 2,
      offset: 0,
    });

    expect(result.summary.newMatches).toBe(5);
    expect(result.summary.total).toBe(5);
    expect(result.pagination.total).toBe(5);
    expect(result.diffs).toHaveLength(2);
    expect(result.diffs.every((d) => d.changed)).toBe(true);
  });

  it('pages through every changed row exactly once', () => {
    for (let i = 0; i < 7; i++) insertTransaction(`COFFEE SHOP ${i}`);

    const seen: string[] = [];
    for (let offset = 0; offset < 7; offset += 3) {
      const page = previewChangeSetFullHistory(db, {
        rules: [],
        changeSet: addCoffeeShopRule,
        limit: 3,
        offset,
      });
      seen.push(...page.diffs.map((d) => d.description));
    }

    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('returns an empty result for an empty history', () => {
    const result = previewChangeSetFullHistory(db, {
      rules: [],
      changeSet: addCoffeeShopRule,
      limit: 50,
      offset: 0,
    });

    expect(result.summary.total).toBe(0);
    expect(result.diffs).toEqual([]);
    expect(result.pagination).toEqual({ total: 0, limit: 50, offset: 0, hasMore: false });
  });

  it('excludes an unaffected transaction from the paged diffs, but still counts it in summary.total', () => {
    insertTransaction('SUPERMARKET RUN');

    const result = previewChangeSetFullHistory(db, {
      rules: [],
      changeSet: addCoffeeShopRule,
      limit: 50,
      offset: 0,
    });

    expect(result.summary.total).toBe(1);
    expect(result.summary.newMatches).toBe(0);
    expect(result.diffs).toEqual([]);
  });
});
