import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { MAX_CONTAINMENT_DEPTH } from '../../domain/commands/index.js';
import { countRows, hiddenInactiveConditions } from './items-page-filters.js';

import type { WebItemContentCounts } from '../../contract/rest-web.js';
import type { ItemRow } from '../../db/index.js';
import type { CommandDb } from '../../domain/commands/index.js';
import type { WebItemsFilter } from './items-page-filters.js';

const contentCountRowSchema = z.object({
  containerId: z.string(),
  direct: z.number().int().nonnegative(),
  deep: z.number().int().nonnegative(),
});

/** Count live inactive rows hidden by the default web item view. */
export function hiddenInactiveCount(
  db: CommandDb,
  filter: WebItemsFilter,
  total: number,
  textMatch: SQL | undefined
): number {
  if (filter.lifecycle !== undefined || filter.includeInactive === true) return 0;
  const conditions = hiddenInactiveConditions(db, filter);
  if (textMatch !== undefined) conditions.push(textMatch);
  return Math.max(0, countRows(db, conditions) - total);
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
      WITH RECURSIVE descendants(container_id, item_id, depth) AS (
        SELECT child.containing_item_id, child.id, 1
        FROM items AS child
        WHERE child.containing_item_id IN (${ids})
        UNION ALL
        SELECT descendants.container_id, child.id, descendants.depth + 1
        FROM items AS child
        JOIN descendants ON child.containing_item_id = descendants.item_id
        WHERE descendants.depth < ${MAX_CONTAINMENT_DEPTH}
      )
      SELECT
        descendants.container_id AS "containerId",
        COUNT(DISTINCT CASE
          WHEN content.deleted_at IS NULL AND content.lifecycle = 'active' AND descendants.depth = 1
          THEN descendants.item_id
        END) AS "direct",
        COUNT(DISTINCT CASE
          WHEN content.deleted_at IS NULL AND content.lifecycle = 'active'
          THEN descendants.item_id
        END) AS "deep"
      FROM descendants
      JOIN items AS content ON content.id = descendants.item_id
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
