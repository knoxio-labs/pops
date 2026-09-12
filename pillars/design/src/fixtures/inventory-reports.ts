/**
 * The roll-ups the inventory dashboard and value-breakdown cards render.
 *
 * Every figure here is derived from {@link inventoryItems} the way
 * `pillars/inventory/src/api/modules/reports/service.ts` derives it from the
 * `home_inventory` table, so a screen showing this alongside the items list
 * never contradicts it: `totalReplacementValue` is the same sum the items
 * fixture already totals, `recentlyAdded` is the five items with the latest
 * `lastEditedTime`, and `warrantiesExpiringSoon` counts the same 90-day
 * window the service does.
 */
import { inventoryItems, inventoryItemTotals } from './inventory-items';
import { locationNameById } from './inventory-locations';

import type { InventoryFixtureItem } from './inventory-items';

export interface BreakdownEntryFixture {
  name: string;
  totalValue: number;
  itemCount: number;
  key?: string | null;
}

export interface RecentItemFixture {
  id: string;
  itemName: string;
  type: string | null;
  assetId: string | null;
  lastEditedTime: string;
}

export interface DashboardSummaryFixture {
  itemCount: number;
  totalReplacementValue: number;
  totalResaleValue: number;
  warrantiesExpiringSoon: number;
  recentlyAdded: RecentItemFixture[];
}

/** The "today" the 90-day warranty window and every relative-time label in the fixture set are anchored to. */
const REFERENCE_DATE = '2026-09-12';

const WARRANTY_WINDOW_DAYS = 90;

function warrantyWindowCutoff(reference: string, days: number): string {
  const cutoff = new Date(reference);
  cutoff.setUTCDate(cutoff.getUTCDate() + days);
  return cutoff.toISOString().slice(0, 10);
}

function countWarrantiesExpiringSoon(items: InventoryFixtureItem[]): number {
  const cutoff = warrantyWindowCutoff(REFERENCE_DATE, WARRANTY_WINDOW_DAYS);
  return items.filter(
    (item) =>
      item.warrantyExpires !== null &&
      item.warrantyExpires >= REFERENCE_DATE &&
      item.warrantyExpires <= cutoff
  ).length;
}

function recentlyAdded(items: InventoryFixtureItem[], take: number): RecentItemFixture[] {
  return items
    .toSorted((a, b) => (a.lastEditedTime < b.lastEditedTime ? 1 : -1))
    .slice(0, take)
    .map((item) => ({
      id: item.id,
      itemName: item.itemName,
      type: item.type,
      assetId: item.assetId,
      lastEditedTime: item.lastEditedTime,
    }));
}

function byTotalValueDescending(a: BreakdownEntryFixture, b: BreakdownEntryFixture): number {
  return b.totalValue - a.totalValue;
}

function valueByType(items: InventoryFixtureItem[]): BreakdownEntryFixture[] {
  const groups = new Map<string, { totalValue: number; itemCount: number }>();
  for (const item of items) {
    const name = item.type ?? 'Uncategorized';
    const group = groups.get(name) ?? { totalValue: 0, itemCount: 0 };
    group.totalValue += item.replacementValue ?? 0;
    group.itemCount += 1;
    groups.set(name, group);
  }
  return [...groups.entries()]
    .map(([name, group]) => ({ name, ...group }))
    .toSorted(byTotalValueDescending);
}

function valueByLocation(items: InventoryFixtureItem[]): BreakdownEntryFixture[] {
  const names = locationNameById();
  const groups = new Map<
    string,
    { name: string; key: string | null; totalValue: number; itemCount: number }
  >();
  for (const item of items) {
    const key = item.locationId;
    const name = key !== null ? (names.get(key) ?? key) : 'Unassigned';
    const groupKey = key ?? '__unassigned__';
    const group = groups.get(groupKey) ?? { name, key, totalValue: 0, itemCount: 0 };
    group.totalValue += item.replacementValue ?? 0;
    group.itemCount += 1;
    groups.set(groupKey, group);
  }
  return [...groups.values()].toSorted(byTotalValueDescending);
}

/** What `GET /reports/dashboard` answers for {@link inventoryItems}. */
export const dashboardSummary: DashboardSummaryFixture = {
  itemCount: inventoryItems.length,
  totalReplacementValue: inventoryItemTotals.totalReplacementValue,
  totalResaleValue: inventoryItemTotals.totalResaleValue,
  warrantiesExpiringSoon: countWarrantiesExpiringSoon(inventoryItems),
  recentlyAdded: recentlyAdded(inventoryItems, 5),
};

/** The dashboard report with no items: the report's zero state. */
export const dashboardSummaryEmpty: DashboardSummaryFixture = {
  itemCount: 0,
  totalReplacementValue: 0,
  totalResaleValue: 0,
  warrantiesExpiringSoon: 0,
  recentlyAdded: [],
};

/** What `GET /reports/value-by-type` answers for {@link inventoryItems}, highest value first. */
export const valueByTypeBreakdown: BreakdownEntryFixture[] = valueByType(inventoryItems);

/** The type breakdown with no items: the chart's "no items with replacement values" state. */
export const valueByTypeBreakdownEmpty: BreakdownEntryFixture[] = [];

/** What `GET /reports/value-by-location` answers for {@link inventoryItems}, highest value first. */
export const valueByLocationBreakdown: BreakdownEntryFixture[] = valueByLocation(inventoryItems);

/** The location breakdown with no items: the chart's "no items with replacement values" state. */
export const valueByLocationBreakdownEmpty: BreakdownEntryFixture[] = [];
