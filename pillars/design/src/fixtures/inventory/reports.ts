/**
 * Provenance for the core items, as the reports read it: replacement value
 * and purchase price per unit (whole AUD), purchase date, merchant, warranty
 * expiry, the Paperless receipt and the photo count. Dates sit around
 * `REPORT_NOW` so every warranty tier has something in it: the console, the
 * television and the label printer inside 30 days, a kettle expired ten days
 * ago, a router expired in February.
 * The torch, the spice jars and the baubles have no value on purpose.
 */
import { reportEntries } from '@/kit/inventory/reports/report-model';

import { coreWorld } from './core';

import type { Provenance, ReportEntry } from '@/kit/inventory/reports/report-model';

/** The instant every report state is computed against, so tiers never drift. */
export const REPORT_NOW = new Date('2026-09-25T09:00:00+10:00');

type Row = readonly [
  itemId: string,
  replacement: number | null,
  purchase: number | null,
  purchasedOn: string | null,
  merchant: string | null,
  warranty: string | null,
  receipt: number | null,
  photos: number,
];

const rows: readonly Row[] = [
  ['itm-tv', 2499, 2199, '2024-11-02', 'JB Hi-Fi', '2026-10-12', 1041, 2],
  ['itm-soundbar', 899, 799, '2024-11-02', 'JB Hi-Fi', '2026-11-02', 1042, 1],
  ['itm-console', 749, 699, '2025-03-14', 'EB Games', '2026-10-04', 1077, 1],
  ['itm-hdmi', 25, 19, '2024-11-02', 'JB Hi-Fi', null, null, 0],
  ['itm-usbc', 19, 15, '2025-06-01', 'Officeworks', null, null, 0],
  ['itm-plates', 22, 18, '2023-02-11', 'Myer', null, null, 1],
  ['itm-drill', 329, 299, '2023-06-10', 'Bunnings', '2028-06-10', 988, 1],
  ['itm-tape', 29, 25, '2023-06-10', 'Bunnings', null, null, 0],
  ['itm-screw', 49, 45, '2023-06-10', 'Bunnings', null, null, 0],
  ['itm-headphones', 549, 499, '2025-12-01', 'JB Hi-Fi', '2026-12-01', 1120, 1],
  ['itm-torch', null, null, null, null, null, null, 0],
  ['itm-router', 399, 349, '2024-02-20', 'Officeworks', '2026-02-20', 1003, 1],
  ['itm-blender', 229, 199, '2025-08-05', 'The Good Guys', '2027-08-05', 1095, 1],
  ['itm-long', 89, 79, '2026-01-10', 'Brita', null, null, 0],
  ['itm-charger', 129, 129, '2025-06-01', 'Apple', null, null, 0],
  ['itm-kettle', 149, 129, '2024-09-15', 'The Good Guys', '2026-09-15', 1060, 1],
  ['itm-mugs', 12, 9, '2023-02-11', 'Myer', null, null, 0],
  ['itm-knife', 189, 159, '2023-02-11', 'Chef Works', null, null, 1],
  ['itm-toaster', 99, 89, '2024-12-20', 'Kmart', '2026-12-20', null, 0],
  ['itm-spices', null, null, null, null, null, null, 0],
  ['itm-monitor', 649, 599, '2025-05-01', 'Officeworks', '2027-05-01', 1101, 1],
  ['itm-keyboard', 179, 179, '2025-05-01', 'Officeworks', null, null, 0],
  ['itm-lamp', 89, 79, '2024-04-02', 'IKEA', null, null, 1],
  ['itm-printer', 249, 229, '2025-10-20', 'Officeworks', '2026-10-20', 1150, 1],
  ['itm-bits', 59, 49, '2023-06-10', 'Bunnings', null, null, 0],
  ['itm-ladder', 139, 119, '2022-11-05', 'Bunnings', null, null, 0],
  ['itm-paperbacks', 12, 15, null, null, null, null, 1],
  ['itm-sheets', 79, 69, '2024-03-30', 'Adairs', null, null, 0],
  ['itm-baubles', null, null, null, null, null, null, 0],
  ['itm-lights', 29, 25, '2021-12-01', 'Kmart', null, null, 0],
  ['itm-chair', 699, 649, '2025-03-01', 'Koala', '2031-03-01', 1071, 1],
  ['itm-desk', 1199, 1099, '2025-07-01', 'Desky', '2030-07-01', 1133, 2],
  ['itm-vacuum', 899, 799, '2025-01-15', 'Dyson', '2027-01-15', 1049, 1],
  ['itm-pots', 18, 15, '2024-10-02', 'Bunnings', null, null, 0],
];

/** Provenance for every core item that has any. */
export const reportProvenance: readonly Provenance[] = rows.map(
  ([itemId, replacement, purchase, purchasedOn, merchant, warranty, receipt, photos]) => ({
    itemId,
    replacementValue: replacement,
    purchasePrice: purchase,
    purchasedOn,
    merchant,
    warrantyExpires: warranty,
    receiptId: receipt,
    photos,
  })
);

/** The counted entries every report state reads. */
export const reportEntriesFixture: readonly ReportEntry[] = reportEntries(
  coreWorld,
  reportProvenance
);
