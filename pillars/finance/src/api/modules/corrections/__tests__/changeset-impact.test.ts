/**
 * `computeChangeSetImpact` regression coverage for POPS-2699:
 *
 * - the published `counts.affected` must be the true match count, not the
 *   size of the `.limit(maxPreviewItems)`-capped row set `fetchCandidates`
 *   used to return (defect 1);
 * - a `regex` rule's candidates must actually satisfy the regex against the
 *   raw description, not an arbitrary table-order slice from a `WHERE`-less
 *   query (defect 2).
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
import { computeChangeSetImpact } from '../changeset-impact.js';

import type { ChangeSet } from '../../../../contract/rest-corrections.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-changeset-impact-test-'));
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

function addOpChangeSet(descriptionPattern: string, matchType: 'contains' | 'regex'): ChangeSet {
  return {
    source: 'test',
    reason: 'test',
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern,
          matchType,
          entityId: 'ent-1',
          entityName: 'Coffee Co',
          tags: [],
        },
      },
    ],
  };
}

describe('computeChangeSetImpact — counting after truncation (POPS-2699)', () => {
  it('reports the true match count even when it exceeds maxPreviewItems, while capping affected', () => {
    for (let i = 0; i < 7; i++) {
      insertTransaction(`COFFEE SHOP ${i}`);
    }
    insertTransaction('SUPERMARKET RUN');

    const impact = computeChangeSetImpact(db, {
      changeSet: addOpChangeSet('COFFEE', 'contains'),
      matchType: 'contains',
      normalizedPattern: 'COFFEE',
      minConfidence: 0,
      maxPreviewItems: 3,
    });

    expect(impact.counts.affected).toBe(7);
    expect(impact.affected).toHaveLength(3);
  });

  it('reports the full count and item list when the match set is within maxPreviewItems', () => {
    insertTransaction('COFFEE SHOP A');
    insertTransaction('COFFEE SHOP B');

    const impact = computeChangeSetImpact(db, {
      changeSet: addOpChangeSet('COFFEE', 'contains'),
      matchType: 'contains',
      normalizedPattern: 'COFFEE',
      minConfidence: 0,
      maxPreviewItems: 200,
    });

    expect(impact.counts.affected).toBe(2);
    expect(impact.affected).toHaveLength(2);
  });
});

describe('computeChangeSetImpact — regex candidate predicate (POPS-2699)', () => {
  it('only includes transactions the regex actually matches, not an arbitrary slice', () => {
    // Non-matching rows inserted first (and outnumbering maxPreviewItems) so an
    // unfiltered `WHERE`-less query's table-order slice would land entirely on
    // non-matches, hiding the real matches inserted after them.
    insertTransaction('UBER EATS 789');
    insertTransaction('TAXI SERVICE');
    insertTransaction('GROCERY STORE');
    insertTransaction('UBER TRIP 123');
    insertTransaction('UBER TRIP 456');

    const pattern = '^UBER TRIP \\d+$';
    const impact = computeChangeSetImpact(db, {
      changeSet: addOpChangeSet(pattern, 'regex'),
      matchType: 'regex',
      normalizedPattern: pattern,
      minConfidence: 0,
      maxPreviewItems: 2,
    });

    const matchedDescriptions = impact.affected.map((item) => item.description).toSorted();
    expect(matchedDescriptions).toEqual(['UBER TRIP 123', 'UBER TRIP 456']);
    expect(impact.counts.affected).toBe(2);
  });

  it('returns no candidates when nothing in the table matches the regex', () => {
    insertTransaction('UBER EATS 789');
    insertTransaction('TAXI SERVICE');

    const impact = computeChangeSetImpact(db, {
      changeSet: addOpChangeSet('^UBER TRIP \\d+$', 'regex'),
      matchType: 'regex',
      normalizedPattern: '^UBER TRIP \\d+$',
      minConfidence: 0,
      maxPreviewItems: 200,
    });

    expect(impact.affected).toEqual([]);
    expect(impact.counts.affected).toBe(0);
  });
});
