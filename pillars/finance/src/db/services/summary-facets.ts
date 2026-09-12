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
  ROW_COUNT,
  SPEND_CENTS,
  shareOfTotal,
  spendWithinRange,
  toMeasure,
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

/**
 * Spend per tag. A transaction carrying three tags contributes its full
 * amount to each, so these never sum to the window total — a tag total
 * answers "how much spend touched this tag", not "how was the total split".
 */
export function spendByTag(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number,
  limit: number
): TagSpend[] {
  const rows = db.all<TagRow>(sql`
    SELECT je.value AS tag, ${SPEND_CENTS} AS cents, ${ROW_COUNT} AS transactionCount
    FROM ${transactions}, json_each(${transactions.tags}) AS je
    WHERE ${spendWithinRange(range)}
    GROUP BY je.value
    ORDER BY ${desc(SPEND_CENTS)}, je.value
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    tag: row.tag,
    spend: toMeasure(row),
    shareOfTotal: shareOfTotal(row.cents ?? 0, totalCents),
  }));
}

interface EntityRow {
  entityId: string | null;
  entityName: string | null;
  cents: number | null;
  transactionCount: number | null;
}

/**
 * Spend per entity, with every unresolved row collapsed into one `null`
 * bucket so the shares still account for the whole window. `entity_name` is
 * only a label (the id is operative), so the unattributed bucket carries no
 * name even where individual rows happen to have one.
 */
export function spendByEntity(
  db: FinanceDb,
  range: SummaryRange,
  totalCents: number,
  limit: number
): EntitySpend[] {
  const rows = db.all<EntityRow>(sql`
    SELECT ${transactions.entityId} AS entityId,
           MAX(${transactions.entityName}) AS entityName,
           ${SPEND_CENTS} AS cents,
           ${ROW_COUNT} AS transactionCount
    FROM ${transactions}
    WHERE ${spendWithinRange(range)}
    GROUP BY ${transactions.entityId}
    ORDER BY ${desc(SPEND_CENTS)}, ${transactions.entityId}
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    entityId: row.entityId,
    entityName: row.entityId === null ? null : row.entityName,
    spend: toMeasure(row),
    shareOfTotal: shareOfTotal(row.cents ?? 0, totalCents),
  }));
}
