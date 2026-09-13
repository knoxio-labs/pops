/**
 * Port of `pillars/inventory/app/src/pages/item-form-page/item-record.ts`.
 * The source normalises an `ItemRecord` from the generated client into the
 * form's field shape; here the same normalisation runs against a fixture
 * `InventoryFixtureItem`, which carries the same nullable string/number
 * fields the API record does.
 */
import { type ItemFormValues } from './types';

import type { InventoryFixtureItem } from '@/fixtures/inventory-items';

function s(v: string | null | undefined): string {
  return v ?? '';
}

/** Normalise a stored condition value to title-case so it matches the select options. */
function normalizeCondition(v: string | null | undefined): string {
  const raw = v ?? '';
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function n(v: number | null | undefined): string {
  return v?.toString() ?? '';
}

export function itemToFormValues(item: InventoryFixtureItem): ItemFormValues {
  return {
    itemName: item.itemName,
    brand: s(item.brand),
    model: s(item.model),
    itemId: s(item.itemId),
    type: s(item.type),
    condition: normalizeCondition(item.condition),
    locationId: s(item.locationId),
    inUse: item.inUse,
    deductible: item.deductible,
    purchaseDate: s(item.purchaseDate),
    warrantyExpires: s(item.warrantyExpires),
    purchasePrice: n(item.purchasePrice),
    replacementValue: n(item.replacementValue),
    resaleValue: n(item.resaleValue),
    assetId: s(item.assetId),
    notes: s(item.notes),
  };
}
