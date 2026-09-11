/**
 * `kind` has to narrow the SQL `LIMIT` sees, not the rows after it.
 *
 * Before this, `listReconcileQueue` paged the unfiltered "undecided"
 * ordering in SQL and threw away rows of the wrong `kind` in a JS loop —
 * so a filtered page could come back short, or empty, while the database
 * held plenty of matching rows behind the ones it happened to fetch. Every
 * test here builds a corpus where the naive unfiltered top-N is entirely
 * the WRONG kind, so a regression back to post-limit filtering returns an
 * empty or short page instead of a full one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listReconcileQueue, persistProposedLinks, createPurchase } from '../index.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb, PurchasesDb } from '../index.js';
import type { QueueEntry, QueueFilter } from '../services/reconcile-queue.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let db: PurchasesDb;

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  db = opened.db;
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

/**
 * One charge, on its own order, ordered at a distinct instant.
 *
 * `index` both makes every `sourceOrderId`/checksum unique and spaces the
 * `orderedAt` values a day apart so the DESC ordering the queue sorts by is
 * unambiguous — no two charges tie, so a test can talk about "the newest N"
 * without worrying about a tie-break reordering them.
 */
function seedCharge(index: number): string {
  const orderedAt = new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString();
  const purchaseId = createPurchase(db, {
    source: 'amazon',
    sourceOrderId: `order-${index}`,
    ingestMethod: 'export',
    orderedAt,
    currency: 'AUD',
    totalCents: 1000 + index,
    checksum: `checksum-${index}`,
    charges: [{ sourceChargeRef: `chg-${index}`, amountCents: 1000 + index }],
  });

  const row = opened.raw
    .prepare('SELECT id FROM purchase_charges WHERE purchase_id = ?')
    .get(purchaseId) as { id: string };
  return row.id;
}

/** Give a charge an unconfirmed link, which is what makes it `proposed`. */
function propose(chargeId: string): void {
  persistProposedLinks(db, [
    {
      chargeId,
      transactionUri: `pops://finance/transaction/${chargeId}`,
      transactionDescription: 'AMAZON MARKETPLACE',
      amountCents: 1000,
      linkType: 'exact',
      confidence: 1,
      matchRuleId: null,
    },
  ]);
}

/**
 * Charges 0..count-1, newest first (index 0 is newest since it has the
 * largest `orderedAt`... actually the opposite: higher index is later, so
 * index `count - 1` is newest). `proposedIndices` names which of them get
 * an unconfirmed link; every other charge is left unexplained.
 */
function seedCorpus(count: number, proposedIndices: ReadonlySet<number>): string[] {
  const chargeIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const chargeId = seedCharge(i);
    chargeIds.push(chargeId);
    if (proposedIndices.has(i)) propose(chargeId);
  }
  // Newest first, matching the queue's own ordering.
  return chargeIds.toReversed();
}

function queue(filter: QueueFilter = {}): QueueEntry[] {
  return listReconcileQueue(db, filter);
}

describe('kind is folded into the SQL predicate', () => {
  it('returns a full page of `unexplained` even when the newest rows are all `proposed`', () => {
    // 20 charges: the 5 newest (indices 15..19) are proposed, everything
    // older is unexplained. The old code paged the unfiltered top-5 in SQL
    // — all proposed — then filtered them away in JS, leaving zero.
    const newestFive = new Set([15, 16, 17, 18, 19]);
    seedCorpus(20, newestFive);

    const result = queue({ kind: 'unexplained', limit: 5 });

    expect(result).toHaveLength(5);
    for (const entry of result) expect(entry.proposed).toHaveLength(0);
  });

  it('returns a full page of `proposed` even when the newest rows are all `unexplained`', () => {
    const noneProposedAmongNewest = new Set([0, 1, 2, 3, 4]); // the oldest five
    seedCorpus(20, noneProposedAmongNewest);

    const result = queue({ kind: 'proposed', limit: 5 });

    expect(result).toHaveLength(5);
    for (const entry of result) expect(entry.proposed.length).toBeGreaterThan(0);
  });

  it('pages a filtered kind into disjoint, complete pages', () => {
    // 30 charges, alternating kind, so every offset window still has to
    // reach past several charges of the wrong kind to fill a page of 4.
    const proposedIndices = new Set<number>();
    for (let i = 0; i < 30; i += 2) proposedIndices.add(i);
    const newestFirst = seedCorpus(30, proposedIndices);
    const expectedUnexplainedOrder = newestFirst.filter((_, position) => {
      const originalIndex = 29 - position;
      return !proposedIndices.has(originalIndex);
    });

    const pageOne = queue({ kind: 'unexplained', limit: 4, offset: 0 });
    const pageTwo = queue({ kind: 'unexplained', limit: 4, offset: 4 });
    const pageThree = queue({ kind: 'unexplained', limit: 4, offset: 8 });

    expect(pageOne.map((e) => e.chargeId)).toEqual(expectedUnexplainedOrder.slice(0, 4));
    expect(pageTwo.map((e) => e.chargeId)).toEqual(expectedUnexplainedOrder.slice(4, 8));
    expect(pageThree.map((e) => e.chargeId)).toEqual(expectedUnexplainedOrder.slice(8, 12));

    const seen = new Set([...pageOne, ...pageTwo, ...pageThree].map((e) => e.chargeId));
    expect(seen.size).toBe(12);
    for (const entry of [...pageOne, ...pageTwo, ...pageThree]) {
      expect(entry.proposed).toHaveLength(0);
    }
  });

  it('leaves the unfiltered result and order unchanged', () => {
    const proposedIndices = new Set([1, 3, 5, 7]);
    const newestFirst = seedCorpus(10, proposedIndices);

    const result = queue({ limit: 10 });

    expect(result.map((e) => e.chargeId)).toEqual(newestFirst);
  });

  it('agrees with filtering the unfiltered list in JS by the old derivation', () => {
    const proposedIndices = new Set<number>();
    for (let i = 0; i < 40; i += 3) proposedIndices.add(i);
    seedCorpus(40, proposedIndices);

    const everything = queue({ limit: 500 });
    const oldDerivationProposed = everything.filter((e) => e.proposed.length > 0);
    const oldDerivationUnexplained = everything.filter((e) => e.proposed.length === 0);

    const sqlProposed = queue({ kind: 'proposed', limit: 500 });
    const sqlUnexplained = queue({ kind: 'unexplained', limit: 500 });

    expect(sqlProposed.map((e) => e.chargeId)).toEqual(
      oldDerivationProposed.map((e) => e.chargeId)
    );
    expect(sqlUnexplained.map((e) => e.chargeId)).toEqual(
      oldDerivationUnexplained.map((e) => e.chargeId)
    );
  });
});
