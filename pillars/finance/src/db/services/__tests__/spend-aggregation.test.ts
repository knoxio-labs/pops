/**
 * What counts as spend (POPS-2610).
 *
 * The ledger here is the one the ticket describes: a purchase, a fee, a gift
 * card bought, and an inbound account payment — all four carrying the same
 * category tag, all four outflow-shaped, and only one of them actually spent on
 * the category. Before the `type` split the aggregation excluded a transfer and
 * nothing else, so the gift card and the payment landed in the total and there
 * was no way to keep them out that did not depend on someone having tagged
 * them.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  classifyFromDescription,
  resolveCommittedType,
} from '../../../contract/transaction-classification.js';
import { freshMigratedFinanceDb } from '../../__tests__/migrated-db.js';
import { seededAccountId } from '../../__tests__/seeded-account.js';
import { bulkComputeSpend, spendMapKey } from '../budget-spend.js';

import type Database from 'better-sqlite3';

import type { FinanceDb } from '../internal.js';

type FinanceTestDb = FinanceDb & { $client: Database.Database };

const CATEGORY = 'contains:groceries';
const NOW = new Date('2026-05-20T00:00:00Z');

function freshDb(): FinanceTestDb {
  const { db, raw } = freshMigratedFinanceDb();
  return Object.assign(db, { $client: raw });
}

/**
 * Seed a row the way the import pipeline would type it — descriptor first, then
 * the gift-card rewrite — rather than asserting a hand-picked `type`. A test
 * that types its own fixtures proves only that the SQL filter reads the column;
 * this one fails if either classification rule stops firing.
 */
function seedAsClassified(
  db: FinanceTestDb,
  input: { description: string; amountCents: number; tags: string[] }
): void {
  const derived = classifyFromDescription(input.description);
  const tags = derived?.tag ? [...input.tags, derived.tag] : input.tags;
  seed(db, {
    ...input,
    tags,
    type: resolveCommittedType(derived?.type ?? 'purchase', tags),
  });
}

function seed(
  db: FinanceTestDb,
  input: { description: string; amountCents: number; type: string; tags: string[] }
): void {
  db.$client
    .prepare(
      `INSERT INTO transactions (id, description, account, account_id, amount_cents, date, type, tags, last_edited_time)
       VALUES (?, ?, 'Amex', ?, ?, '2026-05-10', ?, ?, '2026-05-10T00:00:00Z')`
    )
    .run(
      crypto.randomUUID(),
      input.description,
      seededAccountId(db, 'Amex'),
      input.amountCents,
      input.type,
      JSON.stringify(input.tags)
    );
}

function spendOn(db: FinanceTestDb, category = CATEGORY): number {
  return (
    bulkComputeSpend(db, [{ category, period: null }], NOW).get(spendMapKey(null, category)) ?? 0
  );
}

let db: FinanceTestDb;

beforeEach(() => {
  db = freshDb();
});

describe('bulkComputeSpend — which types are spend', () => {
  it('counts only the purchase out of a purchase, a fee, a gift card and an inbound payment', () => {
    seedAsClassified(db, { description: 'WOOLWORTHS', amountCents: -5000, tags: [CATEGORY] });
    seedAsClassified(db, {
      description: 'INTEREST CHARGES',
      amountCents: -12_621,
      tags: [CATEGORY],
    });
    seedAsClassified(db, {
      description: 'WOOLWORTHS GIFT CARDS',
      amountCents: -10_000,
      tags: [CATEGORY, 'contains:gift-card'],
    });
    seedAsClassified(db, {
      description: 'PayID Payment Received, Thank you',
      amountCents: -20_000,
      tags: [CATEGORY],
    });

    expect(spendOn(db)).toBe(5000);
  });

  it('answers the monthly fee question with no tag dependency', () => {
    seedAsClassified(db, { description: 'INTEREST CHARGES', amountCents: -12_621, tags: [] });
    seedAsClassified(db, {
      description: 'CHARGE FOR OVERDUE PAYMENT',
      amountCents: -3000,
      tags: [],
    });

    const feeCents = db.$client
      .prepare(`SELECT SUM(-amount_cents) AS c FROM transactions WHERE type = 'fee'`)
      .get() as { c: number };
    expect(feeCents.c).toBe(15_621);
  });

  it('excludes income even when its amount is negative', () => {
    seed(db, {
      description: 'SALARY ADJUSTMENT',
      amountCents: -30_000,
      type: 'income',
      tags: [CATEGORY],
    });

    expect(spendOn(db)).toBe(0);
  });

  it('offsets nothing for a positive refund but still counts its negative sibling', () => {
    seed(db, { description: 'WOOLWORTHS', amountCents: -5000, type: 'purchase', tags: [CATEGORY] });
    seed(db, {
      description: 'WOOLWORTHS REFUND',
      amountCents: 2000,
      type: 'refund',
      tags: [CATEGORY],
    });

    expect(spendOn(db)).toBe(5000);
  });
});
