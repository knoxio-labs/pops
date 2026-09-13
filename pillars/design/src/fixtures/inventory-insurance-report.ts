/**
 * Rows for the `/inventory/reports/insurance` screen: shaped as
 * `SortableReportItem` (`kit/inventory/insurance-report/report-model.ts`),
 * the same fields `getInsuranceReport` in
 * `pillars/inventory/src/api/modules/reports/insurance-report.ts` serves per
 * row, resolved against {@link locationTree} from `inventory-locations.ts`
 * so the report's location filter and the fixture's own location ids never
 * disagree.
 *
 * The items are {@link inventoryItems}, the same catalogue the items list and
 * the dashboard read, projected into the report's shape. The report adds
 * three facts an item row does not carry (a photo, filed receipts, a warranty
 * offset); those live in `inventory-insurance-report-rows.ts` beside this.
 */
import { REPORT_EXTRAS } from './inventory-insurance-report-rows';
import { inventoryItems } from './inventory-items';
import { locationNameById, locationTree } from './inventory-locations';

import type { SortableReportItem } from '@/kit/inventory/insurance-report/report-model';

import type { InventoryFixtureItem } from './inventory-item-shape';

/** `now` shifted by `offsetDays` calendar days, as `YYYY-MM-DD`, or `null` through unchanged. */
function iso(now: Date, offsetDays: number | null): string | null {
  if (offsetDays === null) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const names = locationNameById();

function toReportItem(now: Date, item: InventoryFixtureItem): SortableReportItem {
  const extras = REPORT_EXTRAS[item.id] ?? {
    photoPath: null,
    receiptDocumentIds: [],
    warrantyOffsetDays: null,
  };
  return {
    id: item.id,
    itemName: item.itemName,
    assetId: item.assetId,
    brand: item.brand,
    condition: item.condition,
    type: item.type,
    warrantyExpires: iso(now, extras.warrantyOffsetDays),
    replacementValue: item.replacementValue,
    photoPath: extras.photoPath,
    locationId: item.locationId,
    locationName: item.locationId ? (names.get(item.locationId) ?? 'Unknown') : null,
    receiptDocumentIds: extras.receiptDocumentIds,
  };
}

/** Every item in the catalogue, as the report serves it, resolved against `now`. */
export function insuranceReportItemsAt(now: Date): SortableReportItem[] {
  return inventoryItems.map((item) => toReportItem(now, item));
}

/** No items at all: the report's own empty inventory, distinct from a filter matching nothing. */
export const insuranceReportItemsEmpty: SortableReportItem[] = [];

/** The location tree the report's filter and `LocationPicker` both read. `loc-storage` carries no items. */
export { locationTree as insuranceReportLocationTree };

/** A location with no items assigned anywhere in {@link insuranceReportItemsAt}: the filtered-empty branch. */
export const insuranceReportEmptyLocationId = 'loc-storage';
