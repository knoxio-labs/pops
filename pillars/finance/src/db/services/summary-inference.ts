/**
 * The four reads behind the dashboard's inference panel (POPS-250 decision 4,
 * POPS-3589): largest charge, concentration, recurring subscriptions, and
 * foreign spend with its FX fees.
 *
 * Every one of them carries the row count it was measured from, because each
 * has a legitimate structurally-empty answer — a window with no foreign
 * charges, a ledger where nothing is tagged as a subscription — and `$0.00`
 * must not be readable as "measured, and it was nothing".
 */
import { desc, sql } from 'drizzle-orm';

import { accounts, transactions } from '../schema.js';
import {
  EMPTY_MEASURE,
  ROW_COUNT,
  SPEND_CENTS,
  shareOfTotal,
  spendWithinRange,
  toMeasure,
  withinRange,
  type SpendMeasure,
  type SummaryRange,
} from './summary-sql.js';

import type { FinanceDb } from './internal.js';

/**
 * The tag the ledger records a recurring charge with. A convention of the tag
 * vocabulary rather than a column, so it is named once here — the alternative
 * is inferring recurrence from amount and cadence, which is a different and
 * much larger piece of work than the panel asks for.
 */
export const SUBSCRIPTION_TAG = 'contains:subscription';

/** How many entities "concentration" is the combined share of. */
export const CONCENTRATION_ENTITY_COUNT = 5;

export interface LargestCharge {
  id: string;
  description: string;
  date: string;
  /** Positive cents — the amount that left, sign already flipped. */
  cents: number;
  entityId: string | null;
  entityName: string | null;
  accountId: string;
  accountName: string | null;
}

export interface Concentration {
  /** How many entities the share covers — fewer when the window has fewer. */
  entityCount: number;
  cents: number;
  /** `null` when the window's spend is zero; a share of nothing is undefined. */
  shareOfTotal: number | null;
}

export interface SubscriptionEntitySpend {
  entityId: string | null;
  entityName: string | null;
  spend: SpendMeasure;
}

export interface RecurringSubscriptions {
  /** Echoed so a caller can say *what* was counted, not just how much. */
  tag: string;
  spend: SpendMeasure;
  byEntity: SubscriptionEntitySpend[];
}

export interface ForeignSpend {
  /** Spend on rows that recorded a foreign currency, in ledger currency. */
  spend: SpendMeasure;
  /**
   * The issuer's foreign-transaction fees. Not filtered to spend types: a bank
   * that bills the fee as its own `fee` row still attached it to the same
   * `fx_fee_cents` column, and the panel's claim is "FX cost you this", not
   * "your purchases carried this".
   */
  fees: SpendMeasure;
}

export function largestCharge(db: FinanceDb, range: SummaryRange): LargestCharge | null {
  return (
    db.all<LargestCharge>(sql`
      SELECT ${transactions.id} AS id,
             ${transactions.description} AS description,
             ${transactions.date} AS date,
             -${transactions.amountCents} AS cents,
             ${transactions.entityId} AS entityId,
             ${transactions.entityName} AS entityName,
             ${transactions.accountId} AS accountId,
             ${accounts.name} AS accountName
      FROM ${transactions}
      LEFT JOIN ${accounts} ON ${accounts.id} = ${transactions.accountId}
      WHERE ${spendWithinRange(range)} AND ${transactions.amountCents} < 0
      ORDER BY ${transactions.amountCents} ASC, ${transactions.id}
      LIMIT 1
    `)[0] ?? null
  );
}

/**
 * How much of the window's spend the biggest few entities account for.
 *
 * Unattributed rows are excluded from the numerator — "five merchants are 60%
 * of your spend" is a claim about merchants, and the bucket of rows nobody
 * resolved is not one. They stay in the denominator, because they were still
 * spent.
 */
export function concentration(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number
): Concentration {
  const rows = db.all<{ cents: number | null }>(sql`
    SELECT ${SPEND_CENTS} AS cents
    FROM ${transactions}
    WHERE ${spendWithinRange(range)} AND ${transactions.entityId} IS NOT NULL
    GROUP BY ${transactions.entityId}
    ORDER BY ${desc(SPEND_CENTS)}
    LIMIT ${CONCENTRATION_ENTITY_COUNT}
  `);

  const cents = rows.reduce((sum, row) => sum + (row.cents ?? 0), 0);
  return { entityCount: rows.length, cents, shareOfTotal: shareOfTotal(cents, totalCents) };
}

export function recurringSubscriptions(db: FinanceDb, range: SummaryRange): RecurringSubscriptions {
  const rows = db.all<{
    entityId: string | null;
    entityName: string | null;
    cents: number | null;
    transactionCount: number | null;
  }>(sql`
    SELECT ${transactions.entityId} AS entityId,
           MAX(${transactions.entityName}) AS entityName,
           ${SPEND_CENTS} AS cents,
           ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    WHERE ${spendWithinRange(range)}
      AND EXISTS (
        SELECT 1 FROM json_each(${transactions.tags}) AS je WHERE je.value = ${SUBSCRIPTION_TAG}
      )
    GROUP BY ${transactions.entityId}
    ORDER BY ${desc(SPEND_CENTS)}, ${transactions.entityId}
  `);

  const byEntity = rows.map((row) => ({
    entityId: row.entityId,
    entityName: row.entityId === null ? null : row.entityName,
    spend: toMeasure(row),
  }));

  return {
    tag: SUBSCRIPTION_TAG,
    spend: byEntity.reduce(
      (total, entry) => ({
        cents: total.cents + entry.spend.cents,
        transactionCount: total.transactionCount + entry.spend.transactionCount,
      }),
      EMPTY_MEASURE
    ),
    byEntity,
  };
}

export function foreignSpend(db: FinanceDb, range: SummaryRange): ForeignSpend {
  const spend = db.all<{ cents: number | null; transactionCount: number | null }>(sql`
    SELECT ${SPEND_CENTS} AS cents, ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    WHERE ${spendWithinRange(range)} AND ${transactions.foreignCurrency} IS NOT NULL
  `);

  const fees = db.all<{ cents: number | null; transactionCount: number | null }>(sql`
    SELECT COALESCE(SUM(${transactions.fxFeeCents}), 0) AS cents, ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    WHERE ${withinRange(range)} AND ${transactions.fxFeeCents} IS NOT NULL
  `);

  return { spend: toMeasure(spend[0]), fees: toMeasure(fees[0]) };
}
