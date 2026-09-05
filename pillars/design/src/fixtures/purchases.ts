/**
 * Fictional purchases for the iOS purchases list, shaped like
 * `AppCore/Purchases/Purchase.swift`: a merchant the pillar may not have
 * resolved, a total in minor units, and two fields the list screen carries
 * but does not draw.
 */
export interface Purchase {
  id: string;
  /** Absent when the pillar could not resolve one. The row says so itself. */
  merchantName?: string;
  totalMinorUnits: number;
  currency: string;
  orderedOn: string;
  /** Carried by the model and unused by the list screen today. */
  itemCount: number;
  receiptUri?: string;
}

export const purchases: Purchase[] = [
  {
    id: 'pur_01JQ8XN4E7K2M9V3ZB6TYD',
    merchantName: 'Woolworths Metro',
    totalMinorUnits: 8_423,
    currency: 'AUD',
    orderedOn: '2026-09-03',
    itemCount: 12,
    receiptUri: 'pops://receipts/r1',
  },
  {
    id: 'pur_01JQ8W2M6B4H7C1XKD9PFA',
    merchantName: 'Kmart',
    totalMinorUnits: 1_999,
    currency: 'AUD',
    orderedOn: '2026-09-01',
    itemCount: 3,
  },
  {
    id: 'pur_01JQ8V0T3Z8N5R2QWY7JHE',
    merchantName: 'Bunnings Warehouse',
    totalMinorUnits: 15_600,
    currency: 'AUD',
    orderedOn: '2026-08-30',
    itemCount: 7,
    receiptUri: 'pops://receipts/r2',
  },
  {
    id: 'pur_01JQ8TB9K1M4D6P8SXV2QC',
    totalMinorUnits: 4_250,
    currency: 'AUD',
    orderedOn: '2026-08-28',
    itemCount: 1,
  },
  {
    id: 'pur_01JQ8S5F7Y2W9J3HNRK6BM',
    merchantName: 'Sample Coffee',
    totalMinorUnits: 540,
    currency: 'AUD',
    orderedOn: '2026-08-27',
    itemCount: 1,
  },
];
