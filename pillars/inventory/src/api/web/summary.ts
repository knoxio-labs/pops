/**
 * Read-side aggregates for the inventory web Overview and Containers
 * surfaces. The query intentionally works from the item and location tables
 * rather than paging another REST endpoint.
 */
import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { items } from '../../db/index.js';
import { directlyInsideSql, insideContainerSql } from './placement-scope.js';

import type { WebSummaryResponseSchema } from '../../contract/rest-web-summary.js';
import type { CommandDb } from '../../domain/commands/index.js';

const Count = z.number().int().nonnegative();

const summaryRowSchema = z.object({
  itemCount: Count,
  thingCount: Count,
  containerCount: Count,
  openContainerCount: Count,
  locationCount: Count,
  inHandCount: Count,
  openSegmentCount: Count,
  closedSegmentCount: Count,
  fullSegmentCount: Count,
  retiredSegmentCount: Count,
  packingFullButOpenCount: Count,
  packingOpenCount: Count,
});

const summaryQuery = sql`
  SELECT
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 0
    ) AS "itemCount",
    (
      SELECT COALESCE(SUM(quantity), 0)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 0
    ) AS "thingCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 1
    ) AS "containerCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 1 AND access = 'open'
    ) AS "openContainerCount",
    (SELECT COUNT(*) FROM locations WHERE deleted_at IS NULL) AS "locationCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND placement_kind = 'hand'
    ) AS "inHandCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 1 AND access = 'open'
    ) AS "openSegmentCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 1 AND access = 'closed'
    ) AS "closedSegmentCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 1 AND is_full = 1
    ) AS "fullSegmentCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE deleted_at IS NULL AND lifecycle = 'retired' AND is_container = 1
    ) AS "retiredSegmentCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE
        deleted_at IS NULL
        AND lifecycle = 'active'
        AND is_container = 1
        AND access = 'open'
        AND is_full = 1
    ) AS "packingFullButOpenCount",
    (
      SELECT COUNT(*)
      FROM items
      WHERE
        deleted_at IS NULL
        AND lifecycle = 'active'
        AND is_container = 1
        AND access = 'open'
        AND is_full IS NOT 1
    ) AS "packingOpenCount"
`;

/** The wire shape returned by {@link readWebSummary}. */
export type WebSummary = z.infer<typeof WebSummaryResponseSchema>;

interface ContentCounts {
  readonly packingPackedItems: number;
  readonly movingPacked: number;
}

function readSummaryRow(db: CommandDb): z.infer<typeof summaryRowSchema> {
  return summaryRowSchema.parse(db.get(summaryQuery));
}

function countActiveContents(
  db: CommandDb,
  containerIds: readonly string[],
  predicate: (containerId: string) => SQL
): number {
  if (containerIds.length === 0) return 0;
  const containment = or(...containerIds.map(predicate));
  if (containment === undefined) return 0;

  const row = db
    .select({ count: sql<number>`COUNT(DISTINCT ${items.id})` })
    .from(items)
    .where(and(isNull(items.deletedAt), eq(items.lifecycle, 'active'), containment))
    .get();
  return row?.count ?? 0;
}

function readContentCounts(db: CommandDb): ContentCounts {
  const activeContainers = db
    .select({ id: items.id, access: items.access })
    .from(items)
    .where(and(isNull(items.deletedAt), eq(items.lifecycle, 'active'), eq(items.isContainer, 1)))
    .all();
  const activeContainerIds = activeContainers.map((container) => container.id);
  const closedContainerIds = activeContainers
    .filter((container) => container.access === 'closed')
    .map((container) => container.id);

  return {
    packingPackedItems: countActiveContents(db, activeContainerIds, directlyInsideSql),
    movingPacked: countActiveContents(db, closedContainerIds, insideContainerSql),
  };
}

function toWebSummary(row: z.infer<typeof summaryRowSchema>, content: ContentCounts): WebSummary {
  return {
    counts: {
      items: row.itemCount,
      things: row.thingCount,
      containers: row.containerCount,
      openContainers: row.openContainerCount,
      locations: row.locationCount,
      inHand: row.inHandCount,
    },
    containerSegments: {
      all: row.containerCount,
      open: row.openSegmentCount,
      closed: row.closedSegmentCount,
      full: row.fullSegmentCount,
      moving: row.containerCount,
      retired: row.retiredSegmentCount,
    },
    packing: {
      closed: row.closedSegmentCount,
      fullButOpen: row.packingFullButOpenCount,
      open: row.packingOpenCount,
      packedItems: content.packingPackedItems,
    },
    moving: {
      closed: row.closedSegmentCount,
      total: row.containerCount,
      open: row.containerCount - row.closedSegmentCount,
      full: row.fullSegmentCount,
      packed: content.movingPacked,
    },
  };
}

/**
 * Read every aggregate used by the inventory web summary. Tombstoned rows are
 * excluded, active rows drive the Overview and moving counts, and retired
 * containers are retained only for the retired segment.
 */
export function readWebSummary(db: CommandDb): WebSummary {
  return toWebSummary(readSummaryRow(db), readContentCounts(db));
}
