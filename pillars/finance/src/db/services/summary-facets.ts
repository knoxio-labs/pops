/**
 * The two label-keyed breakdowns (POPS-3589): spend per tag and spend per
 * entity.
 *
 * Split from `summary-breakdowns.ts`, which owns the total and the account and
 * month axes, rather than kept with them: the barrel that used to hold every
 * finance service flat reached the 200-line lint cap and ejected three merge
 * groups before anyone saw it on a PR (POPS-3026), and a file that grows a row
 * type per new facet is the same shape of problem.
 */
import { desc, sql } from 'drizzle-orm';

import { transactions } from '../schema.js';
import {
  COST_OF_CREDIT,
  ROW_COUNT,
  SPEND,
  measureWithinRange,
  shareOfTotal,
  toMeasure,
  type LedgerMeasure,
  type SpendMeasure,
  type SummaryRange,
} from './summary-sql.js';

import type { FinanceDb } from './internal.js';

interface LabelledSpend {
  spend: SpendMeasure;
  shareOfTotal: number | null;
}

export interface TagSpend extends LabelledSpend {
  tag: string;
}

interface TagAmount {
  tag: string;
  amount: SpendMeasure;
  shareOfTotal: number | null;
}

/** A cost-of-credit breakdown row for one `fee:*` transaction tag. */
export interface TagCostOfCredit extends Omit<TagAmount, 'amount'> {
  fees: SpendMeasure;
}

export interface EntitySpend extends LabelledSpend {
  /** `null` is the unattributed bucket — rows no entity was resolved for. */
  entityId: string | null;
  entityName: string | null;
}

interface TagRow {
  tag: string;
  cents: number | null;
  transactionCount: number | null;
}

interface TagMeasureQuery {
  measure: LedgerMeasure;
  range: SummaryRange;
  totalCents: number;
  limit: number;
  tagPrefix?: string;
}

/**
 * Spend per tag. A transaction carrying three tags contributes its full
 * amount to each, so these never sum to the window total — a tag total
 * answers "how much spend touched this tag", not "how was the total split".
 */
function measureByTag(
  db: FinanceDb,
  { measure, range, totalCents, limit, tagPrefix }: TagMeasureQuery
): TagAmount[] {
  const prefixFilter =
    tagPrefix === undefined
      ? sql``
      : sql`AND substr(je.value, 1, length(${tagPrefix})) = ${tagPrefix} AND length(je.value) > length(${tagPrefix})`;
  const rows = db.all<TagRow>(sql`
    SELECT je.value AS tag, ${measure.cents} AS cents, ${ROW_COUNT} AS transactionCount
    FROM ${transactions}, json_each(${transactions.tags}) AS je
    WHERE ${measureWithinRange(measure, range)} ${prefixFilter}
    GROUP BY je.value
    ORDER BY ${desc(measure.cents)}, je.value
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    tag: row.tag,
    amount: toMeasure(row),
    shareOfTotal: shareOfTotal(row.cents ?? 0, totalCents),
  }));
}

export function spendByTag(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number,
  limit: number
): TagSpend[] {
  return measureByTag(db, { measure: SPEND, range, totalCents, limit }).map(
    ({ amount, ...tag }) => ({ ...tag, spend: amount })
  );
}

/** Group transaction fees by the closed `fee:*` tag namespace. */
export function costOfCreditByTag(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number,
  limit: number
): TagCostOfCredit[] {
  return measureByTag(db, {
    measure: COST_OF_CREDIT,
    range,
    totalCents,
    limit,
    tagPrefix: 'fee:',
  }).map(({ amount, ...tag }) => ({ ...tag, fees: amount }));
}

export interface EntityAmount {
  entityId: string | null;
  entityName: string | null;
  amount: SpendMeasure;
  shareOfTotal: number | null;
}

interface EntityRow {
  entityId: string | null;
  entityName: string | null;
  cents: number | null;
  transactionCount: number | null;
}

/**
 * A measure per entity, with every unresolved row collapsed into one `null`
 * bucket so the shares still account for the whole window. `entity_name` is
 * only a label (the id is operative), so the unattributed bucket carries no
 * name even where individual rows happen to have one.
 */
export interface EntityQuery {
  range: SummaryRange;
  totalCents: number;
  limit: number;
}

export function entityAmounts(
  db: FinanceDb,
  measure: LedgerMeasure,
  { range, totalCents, limit }: EntityQuery
): EntityAmount[] {
  const rows = db.all<EntityRow>(sql`
    SELECT ${transactions.entityId} AS entityId,
           MAX(${transactions.entityName}) AS entityName,
           ${measure.cents} AS cents,
           ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    WHERE ${measureWithinRange(measure, range)}
    GROUP BY ${transactions.entityId}
    ORDER BY ${desc(measure.cents)}, ${transactions.entityId}
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    entityId: row.entityId,
    entityName: row.entityId === null ? null : row.entityName,
    amount: toMeasure(row),
    shareOfTotal: shareOfTotal(row.cents ?? 0, totalCents),
  }));
}

export function spendByEntity(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number,
  limit: number
): EntitySpend[] {
  return entityAmounts(db, SPEND, { range, totalCents, limit }).map(({ amount, ...entity }) => ({
    ...entity,
    spend: amount,
  }));
}
