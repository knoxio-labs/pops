import type { WarrantyItem } from '@/kit/inventory/warranties/types';

/**
 * Warranties for the `/inventory/warranties` screen, sharing item ids, names
 * and brand/model with {@link inventoryItems} in `inventory-items.ts` where
 * the shared fixture already carries a warranty-bearing item, plus a few of
 * this screen's own for the tiers and edge cases the shared set does not
 * reach.
 *
 * `categorizeWarranties` sorts every warranty into a tier relative to *now*,
 * so a hardcoded calendar date would drift into the wrong tier the moment
 * today's date passes it. Every date here is instead an offset from the
 * `now` the caller supplies, computed by {@link iso}; the screen passes the
 * same `now` it renders with, so a fixture's tier never disagrees with what
 * `categorizeWarranties` puts it in.
 */

/** `now` shifted by `offsetDays` calendar days, as `YYYY-MM-DD`. */
function iso(now: Date, offsetDays: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface WarrantyRow {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  model: string | null;
  offsetDays: number;
  replacementValue: number | null;
  warrantyDocumentId: number | null;
}

function toWarrantyItem(now: Date, row: WarrantyRow): WarrantyItem {
  return {
    id: row.id,
    itemName: row.itemName,
    assetId: row.assetId,
    brand: row.brand,
    model: row.model,
    warrantyExpires: iso(now, row.offsetDays),
    replacementValue: row.replacementValue,
    warrantyDocumentId: row.warrantyDocumentId,
  };
}

/**
 * One warranty in every tier `categorizeWarranties` produces, plus a warranty
 * with no brand or model and no asset id (`itm-sofa`, matching the shared
 * fixture) and one with a linked Paperless document (`itm-laptop`) whose link
 * only renders once a `paperlessBaseUrl` is passed in.
 */
const ALL_TIERS_ROWS: WarrantyRow[] = [
  {
    id: 'itm-laptop',
    itemName: 'MacBook Pro 16" M4 Max',
    assetId: 'HI-0002',
    brand: 'Apple',
    model: 'MRW73X/A',
    offsetDays: 10,
    replacementValue: 6499,
    warrantyDocumentId: 42,
  },
  {
    id: 'itm-sofa',
    itemName: 'Three-seat linen sofa',
    assetId: null,
    brand: null,
    model: null,
    offsetDays: 20,
    replacementValue: 2400,
    warrantyDocumentId: null,
  },
  {
    id: 'itm-camera',
    itemName: 'Fujifilm X-T5 body',
    assetId: 'HI-0011',
    brand: 'Fujifilm',
    model: 'X-T5',
    offsetDays: 45,
    replacementValue: 2599,
    warrantyDocumentId: null,
  },
  {
    id: 'itm-vacuum',
    itemName: 'Dyson V15 Detect',
    assetId: 'HI-0006',
    brand: 'Dyson',
    model: 'SV22',
    offsetDays: 75,
    replacementValue: 1249,
    warrantyDocumentId: null,
  },
  {
    id: 'itm-tv',
    itemName: 'LG C4 65" OLED television',
    assetId: 'HI-0001',
    brand: 'LG',
    model: 'OLED65C4PSA',
    offsetDays: 900,
    replacementValue: 3495,
    warrantyDocumentId: null,
  },
  {
    id: 'itm-printer',
    itemName: 'Brother laser printer',
    assetId: 'HI-0008',
    brand: 'Brother',
    model: 'HL-L2350DW',
    offsetDays: -400,
    replacementValue: 229,
    warrantyDocumentId: null,
  },
];

export function warrantyItemsAt(now: Date): WarrantyItem[] {
  return ALL_TIERS_ROWS.map((row) => toWarrantyItem(now, row));
}

const SINGLE_TIER_ROW: WarrantyRow = {
  id: 'itm-drill',
  itemName: 'Makita 18V hammer drill',
  assetId: 'HI-0004',
  brand: 'Makita',
  model: 'DHP484Z',
  offsetDays: 45,
  replacementValue: 279,
  warrantyDocumentId: null,
};

/** A single warranty, alone in the warning tier. */
export function singleTierWarrantyAt(now: Date): WarrantyItem[] {
  return [toWarrantyItem(now, SINGLE_TIER_ROW)];
}

const SCROLLABLE_NAMES: Array<[string, string | null, string | null, string | null]> = [
  ['Samsung QN90 75" QLED television', 'HI-0101', 'Samsung', 'QN90DA'],
  ['Sony WH-1000XM6 headphones', 'HI-0102', 'Sony', 'WH-1000XM6'],
  ['Bosch dishwasher', 'HI-0103', 'Bosch', 'SMV6ZCX01A'],
  ['KitchenAid stand mixer', 'HI-0104', 'KitchenAid', 'KSM175'],
  ['Nintendo Switch 2', 'HI-0105', 'Nintendo', 'HEG-001'],
  ['Weber Genesis gas barbecue', 'HI-0106', 'Weber', 'Genesis EX-335'],
  ['Herman Miller Aeron chair', null, null, 'Aeron'],
  ['DJI Mavic 4 drone', 'HI-0108', 'DJI', 'Mavic 4'],
  ['Garmin Fenix 8 watch', 'HI-0109', 'Garmin', 'Fenix 8'],
  ['Bosch cordless vacuum', 'HI-0110', 'Bosch', 'Unlimited 7'],
  ['Ninja Foodi air fryer', 'HI-0111', 'Ninja', 'Foodi Max'],
  ['Sonos Arc soundbar', 'HI-0112', 'Sonos', 'Arc'],
];

/** Enough warranties in one tier (critical, staggered a day apart) to require scrolling. */
export function scrollableTierWarrantiesAt(now: Date): WarrantyItem[] {
  return SCROLLABLE_NAMES.map(([itemName, assetId, brand, model], index) => ({
    id: `itm-scroll-${index}`,
    itemName,
    assetId,
    brand,
    model,
    warrantyExpires: iso(now, 2 + index * 2),
    replacementValue: 200 + index * 75,
    warrantyDocumentId: null,
  }));
}
