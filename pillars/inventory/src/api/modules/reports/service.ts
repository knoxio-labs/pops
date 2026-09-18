import { and, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';

/**
 * Inventory reports service — warranty tracking and insurance report queries.
 */
import { items, type InventoryDb, itemDocuments, locations } from '../../../db/index.js';

import type { ItemRow } from '../items/types.js';
import type { DashboardSummary, RecentItem, ValueBreakdownEntry } from './types.js';

export {
  getInsuranceReport,
  type InsuranceReportGroup,
  type InsuranceReportItem,
  type InsuranceReportOptions,
  type InsuranceReportResult,
} from './insurance-report.js';

/** Warranty "expiring soon" window in days. */
const WARRANTY_WINDOW_DAYS = 90;

/**
 * Get dashboard summary: item count, total values, expiring warranties,
 * and recently added items.
 */
export function getDashboard(db: InventoryDb): DashboardSummary {
  const [summary] = db
    .select({
      itemCount: count(),
      totalReplacementValue: sql<number>`COALESCE(SUM(${items.replacementValue}), 0)`,
      totalResaleValue: sql<number>`COALESCE(SUM(${items.resaleValue}), 0)`,
    })
    .from(items)
    .all();

  const now = new Date();
  const cutoff = new Date(now.getTime() + WARRANTY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString().split('T')[0] ?? '';
  const cutoffIso = cutoff.toISOString().split('T')[0] ?? '';

  const [warrantyResult] = db
    .select({ cnt: count() })
    .from(items)
    .where(
      and(
        isNotNull(items.warrantyExpires),
        gte(items.warrantyExpires, nowIso),
        lte(items.warrantyExpires, cutoffIso)
      )
    )
    .all();

  const recentRows = db
    .select({
      id: items.id,
      itemName: items.name,
      type: items.legacyType,
      assetId: items.code,
      lastEditedTime: items.lastEditedTime,
    })
    .from(items)
    .orderBy(desc(items.lastEditedTime))
    .limit(5)
    .all();

  return {
    itemCount: summary?.itemCount ?? 0,
    totalReplacementValue: Math.round((summary?.totalReplacementValue ?? 0) * 100) / 100,
    totalResaleValue: Math.round((summary?.totalResaleValue ?? 0) * 100) / 100,
    warrantiesExpiringSoon: warrantyResult?.cnt ?? 0,
    recentlyAdded: recentRows as RecentItem[],
  };
}

export interface WarrantyListItem extends ItemRow {
  warrantyDocumentId: number | null;
}

/** List all inventory items that have a warranty expiry date, sorted by expiry. */
export function listWarrantyItems(db: InventoryDb): WarrantyListItem[] {
  const rows = db
    .select({
      item: items,
      warrantyDocumentId: itemDocuments.paperlessDocumentId,
    })
    .from(items)
    .leftJoin(
      itemDocuments,
      and(eq(itemDocuments.itemId, items.id), eq(itemDocuments.documentType, 'warranty'))
    )
    .where(isNotNull(items.warrantyExpires))
    .orderBy(items.warrantyExpires)
    .all();
  return rows.map((r) => ({ ...r.item, warrantyDocumentId: r.warrantyDocumentId ?? null }));
}

/**
 * Get replacement value breakdown grouped by location.
 */
export function getValueByLocation(db: InventoryDb): ValueBreakdownEntry[] {
  return db
    .select({
      name: sql<string>`COALESCE(${locations.name}, 'Unassigned')`,
      totalValue: sql<number>`COALESCE(SUM(${items.replacementValue}), 0)`,
      itemCount: count(),
      key: sql<string | null>`${locations.id}`,
    })
    .from(items)
    .leftJoin(locations, eq(items.locationId, locations.id))
    .groupBy(sql`COALESCE(${locations.name}, 'Unassigned')`, locations.id)
    .orderBy(desc(sql`COALESCE(SUM(${items.replacementValue}), 0)`))
    .all() as ValueBreakdownEntry[];
}

/**
 * Get replacement value breakdown grouped by item type.
 */
export function getValueByType(db: InventoryDb): ValueBreakdownEntry[] {
  return db
    .select({
      name: sql<string>`COALESCE(${items.legacyType}, 'Uncategorized')`,
      totalValue: sql<number>`COALESCE(SUM(${items.replacementValue}), 0)`,
      itemCount: count(),
    })
    .from(items)
    .groupBy(sql`COALESCE(${items.legacyType}, 'Uncategorized')`)
    .orderBy(desc(sql`COALESCE(SUM(${items.replacementValue}), 0)`))
    .all() as ValueBreakdownEntry[];
}
