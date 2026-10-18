import { and, ne, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { items } from '../../db/index.js';
import { MAX_CONTAINMENT_DEPTH } from '../../domain/commands/index.js';

import type { WebItemContentCounts } from '../../contract/rest-web.js';
import type { ItemRow } from '../../db/index.js';
import type { CommandDb } from '../../domain/commands/index.js';
import type { WebItemsConditions, WebItemsFilter } from './items-page-filters.js';

const contentCountRowSchema = z.object({
  containerId: z.string(),
  direct: z.number().int().nonnegative(),
  deep: z.number().int().nonnegative(),
});

/** Current list totals, independent of its page cursor. */
export interface WebItemsTotals {
  readonly total: number;
  readonly unfilteredTotal: number;
  readonly hiddenInactiveCount: number;
}

/** Count matching, baseline and hidden inactive items in one aggregate query. */
export function readWebItemsTotals(
  db: CommandDb,
  filter: WebItemsFilter,
  conditions: WebItemsConditions,
  textMatch: SQL | undefined
): WebItemsTotals {
  const filtered = and(...conditions.filtered, textMatch) ?? sql`1`;
  const lifecycle = and(...conditions.lifecycle) ?? sql`1`;
  const hidden =
    filter.lifecycle !== undefined || filter.includeInactive === true
      ? sql<number>`0`
      : sql<number>`COUNT(CASE WHEN ${ne(items.lifecycle, 'active')} AND ${filtered} THEN 1 END)`;
  return (
    db
      .select({
        total: sql<number>`COUNT(CASE WHEN ${lifecycle} AND ${filtered} THEN 1 END)`,
        unfilteredTotal: sql<number>`COUNT(CASE WHEN ${lifecycle} THEN 1 END)`,
        hiddenInactiveCount: hidden,
      })
      .from(items)
      .where(and(...conditions.baseline))
      .get() ?? { total: 0, unfilteredTotal: 0, hiddenInactiveCount: 0 }
  );
}

/**
 * Read live direct and recursive content counts for the container rows in one
 * web page. The recursive walk follows the same bounded containment semantics
 * as the web placement predicates; only supplied container ids are returned.
 */
export function readWebItemContentCounts(
  db: CommandDb,
  rows: readonly Pick<ItemRow, 'id' | 'isContainer'>[]
): WebItemContentCounts {
  const containerIds = [
    ...new Set(rows.filter((row) => row.isContainer === 1).map((row) => row.id)),
  ];
  if (containerIds.length === 0) return {};

  const ids = sql.join(
    containerIds.map((containerId) => sql`${containerId}`),
    sql`, `
  );
  const countRows = contentCountRowSchema.array().parse(
    db.all(sql`
      WITH RECURSIVE descendants(container_id, item_id, depth, countable) AS (
        SELECT child.containing_item_id, child.id, 1,
          child.deleted_at IS NULL AND child.lifecycle = 'active'
        FROM items AS child
        WHERE child.containing_item_id IN (${ids})
        UNION ALL
        SELECT descendants.container_id, child.id, descendants.depth + 1,
          child.deleted_at IS NULL AND child.lifecycle = 'active'
        FROM items AS child
        JOIN descendants ON child.containing_item_id = descendants.item_id
        WHERE descendants.depth < ${MAX_CONTAINMENT_DEPTH}
      )
      SELECT
        descendants.container_id AS "containerId",
        COUNT(DISTINCT CASE
          WHEN descendants.countable AND descendants.depth = 1
          THEN descendants.item_id
        END) AS "direct",
        COUNT(DISTINCT CASE
          WHEN descendants.countable
          THEN descendants.item_id
        END) AS "deep"
      FROM descendants
      GROUP BY descendants.container_id
    `)
  );

  const counts: WebItemContentCounts = Object.fromEntries(
    containerIds.map((containerId) => [containerId, { direct: 0, deep: 0 }])
  );
  for (const row of countRows) {
    if (Object.hasOwn(counts, row.containerId)) {
      counts[row.containerId] = { direct: row.direct, deep: row.deep };
    }
  }
  return counts;
}
