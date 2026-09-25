/**
 * Fictional purchases for the search Purchases scope. Search shows them as
 * a read-only summary with a link into the Purchases pillar (owner decision
 * 4); a line bought for something tracked names that item.
 */
import type { PurchaseResult } from '@/kit/inventory/search/purchase-model';

/** Purchases the Purchases scope searches. */
export const purchaseResults: readonly PurchaseResult[] = [
  {
    id: 'po-1142',
    merchant: 'Officeworks',
    orderNumber: 'OW-883142',
    date: '2026-08-02',
    totalCents: 6385,
    lines: [
      { name: 'HDMI cable 2 m', quantity: 3, priceCents: 1995, itemId: 'itm-hdmi' },
      { name: 'Cable ties, 100 pack', quantity: 1, priceCents: 400 },
    ],
  },
  {
    id: 'po-1188',
    merchant: 'Kmart',
    orderNumber: 'KM-20931',
    date: '2026-09-12',
    totalCents: 1400,
    lines: [{ name: 'Cable organiser, 3 pack', quantity: 1, priceCents: 1400 }],
  },
  {
    id: 'po-1203',
    merchant: 'Amazon',
    orderNumber: '114-2231907',
    date: '2026-09-03',
    totalCents: 8640,
    lines: [
      { name: 'USB-C cable 1 m, 6 pack', quantity: 1, priceCents: 2899, itemId: 'itm-usbc' },
      { name: 'Label printer tape', quantity: 2, priceCents: 1950 },
      { name: 'Cable management sleeve', quantity: 1, priceCents: 1841 },
    ],
  },
  {
    id: 'po-0977',
    merchant: 'JB Hi-Fi',
    orderNumber: 'JB-4410982',
    date: '2025-11-28',
    totalCents: 149900,
    lines: [
      { name: 'Television 65 in', quantity: 1, priceCents: 139900, itemId: 'itm-tv' },
      { name: 'Optical audio cable', quantity: 1, priceCents: 10000 },
    ],
  },
];
