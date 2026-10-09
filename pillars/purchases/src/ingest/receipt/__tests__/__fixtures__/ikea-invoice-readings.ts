import type { ExtractedReceipt } from '../../extraction.js';

export const ikeaCombinationComponentsReading: ExtractedReceipt = {
  merchantName: 'IKEA',
  address: null,
  timeZone: null,
  purchasedOn: '2026-09-15',
  purchasedAt: null,
  currency: 'AUD',
  total: '$436.00',
  tax: null,
  discounts: [],
  surcharges: [],
  shipping: null,
  lines: [
    { description: 'Synthetic BESTÅ component A', amount: '$218.00', listAmount: null },
    { description: 'Synthetic BESTÅ component B', amount: '$218.00', listAmount: null },
  ],
  unreadable: [],
};

export const ikeaCombinationDoubleCountReading: ExtractedReceipt = {
  ...ikeaCombinationComponentsReading,
  discounts: ['$436.00'],
  lines: [
    { description: 'Synthetic BESTÅ combination package', amount: '$436.00', listAmount: null },
    ...ikeaCombinationComponentsReading.lines,
  ],
};

export const ikeaZeroPriceClickAndCollectReading: ExtractedReceipt = {
  merchantName: 'IKEA',
  address: null,
  timeZone: null,
  purchasedOn: '2026-09-15',
  purchasedAt: null,
  currency: 'AUD',
  total: '$1,028.00',
  tax: null,
  discounts: [],
  surcharges: [],
  shipping: null,
  lines: [
    { description: 'Synthetic order merchandise', amount: '$1,028.00', listAmount: null },
    { description: 'Collect at IKEA Store', amount: '$0.00', listAmount: null },
  ],
  unreadable: [],
};

export const ikeaZeroPriceClickAndCollectDoubleDiscountReading: ExtractedReceipt = {
  ...ikeaZeroPriceClickAndCollectReading,
  discounts: ['$5.00'],
};
