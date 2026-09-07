import { describe, expect, it } from 'vitest';

import {
  chargeHeadingLine,
  chargeMetaLine,
  confidenceLabel,
  documentStaleNote,
  landedCostLine,
  linkStatusLabel,
  lineMetaLine,
  pluralize,
  shipmentDateNote,
  shipmentMetaLine,
  skuLabel,
} from './format';

import type {
  Charge,
  ChargeLink,
  OrderDocument,
  OrderLine,
  OrderShipment,
} from '@/fixtures/purchases-order-types';

describe('pluralize', () => {
  it('uses the singular only at exactly one', () => {
    expect(pluralize(1, 'line', 'lines')).toBe('1 line');
  });

  it('uses the plural at zero and above one', () => {
    expect(pluralize(0, 'line', 'lines')).toBe('0 lines');
    expect(pluralize(2, 'line', 'lines')).toBe('2 lines');
  });
});

describe('skuLabel', () => {
  it('says so when there is no SKU', () => {
    expect(skuLabel(null)).toBe('No SKU');
  });

  it('labels an ASIN', () => {
    expect(skuLabel({ scheme: 'asin', value: 'B08XYZ' })).toBe('ASIN B08XYZ');
  });

  it('labels a merchant code', () => {
    expect(skuLabel({ scheme: 'merchant', value: 'BW-1' })).toBe('Merchant code BW-1');
  });
});

describe('lineMetaLine', () => {
  it('joins SKU, quantity and unit price', () => {
    const item = {
      id: 'i1',
      name: 'Widget',
      sku: null,
      quantity: 2,
      unitPriceCents: 1200,
      lineTotalCents: 2400,
      refundedCents: 0,
      kind: null,
    };
    expect(lineMetaLine(item, 'AUD')).toBe('No SKU · 2 units · $12.00 each');
  });
});

describe('landedCostLine', () => {
  const baseLine: OrderLine = {
    item: {
      id: 'i1',
      name: 'Widget',
      sku: null,
      quantity: 1,
      unitPriceCents: 1000,
      lineTotalCents: 1000,
      refundedCents: 0,
      kind: null,
    },
    landedCostCents: 1050,
    tags: [],
    units: [],
    notes: [],
  };

  it('shows only the landed cost when nothing was refunded and no kind is set', () => {
    expect(landedCostLine(baseLine, 'AUD')).toBe('Landed $10.50');
  });

  it('adds the refund when one was made', () => {
    const line: OrderLine = {
      ...baseLine,
      item: { ...baseLine.item, refundedCents: 250 },
    };
    expect(landedCostLine(line, 'AUD')).toBe('Landed $10.50 · Refunded $2.50');
  });

  it('adds the kind when one is set', () => {
    const line: OrderLine = {
      ...baseLine,
      item: { ...baseLine.item, kind: { value: 'durable' } },
    };
    expect(landedCostLine(line, 'AUD')).toBe('Landed $10.50 · Durable');
  });
});

describe('chargeHeadingLine', () => {
  it('joins the role and the origin', () => {
    const charge: Charge = {
      id: 'c1',
      role: 'capture',
      origin: 'merchant',
      amountCents: 100,
      currency: 'AUD',
      chargedAt: null,
      paymentHint: null,
    };
    expect(chargeHeadingLine(charge)).toBe('Capture · stated by the merchant');
  });
});

describe('chargeMetaLine', () => {
  const base: Charge = {
    id: 'c1',
    role: 'capture',
    origin: 'merchant',
    amountCents: 100,
    currency: 'AUD',
    chargedAt: null,
    paymentHint: null,
  };

  it('says there is no charge date when one is absent', () => {
    expect(chargeMetaLine(base, 0)).toBe('No charge date · 0 line allocations');
  });

  it('adds the payment hint when present', () => {
    const charge: Charge = { ...base, paymentHint: 'Visa •••• 1' };
    expect(chargeMetaLine(charge, 1)).toBe('No charge date · Visa •••• 1 · 1 line allocation');
  });
});

describe('confidenceLabel', () => {
  it('rounds to the nearest whole percent', () => {
    expect(confidenceLabel(0.984)).toBe('98% confident');
    expect(confidenceLabel(0.615)).toBe('62% confident');
  });
});

describe('linkStatusLabel', () => {
  const base: ChargeLink = {
    id: 'l1',
    linkType: 'exact',
    confidence: 1,
    confirmedAt: null,
    transactionUri: 'pops://x',
    amountCents: 100,
  };

  it('reads as proposed when unconfirmed', () => {
    expect(linkStatusLabel(base)).toBe('proposed, not confirmed');
  });

  it('reads as confirmed once a confirmation date is set', () => {
    expect(linkStatusLabel({ ...base, confirmedAt: '2026-01-01T00:00:00Z' })).toBe('confirmed');
  });
});

describe('shipmentDateNote', () => {
  const base: OrderShipment = {
    id: 's1',
    status: 'pending',
    shippingCents: 0,
    carrier: null,
    trackingNumber: null,
    shippedAt: null,
    deliveredAt: null,
  };

  it('is null when neither date is set', () => {
    expect(shipmentDateNote(base)).toBeNull();
  });

  it('prefers the shipped date over nothing', () => {
    const shipment = { ...base, shippedAt: '2026-08-21T08:00:00Z' };
    expect(shipmentDateNote(shipment)).toMatch(/^Shipped /);
  });

  it('prefers the delivered date over the shipped date', () => {
    const shipment = {
      ...base,
      shippedAt: '2026-08-21T08:00:00Z',
      deliveredAt: '2026-08-23T15:40:00Z',
    };
    expect(shipmentDateNote(shipment)).toMatch(/^Delivered /);
  });
});

describe('shipmentMetaLine', () => {
  it('says there is no carrier when one is absent', () => {
    const shipment: OrderShipment = {
      id: 's1',
      status: 'pending',
      shippingCents: 0,
      carrier: null,
      trackingNumber: null,
      shippedAt: null,
      deliveredAt: null,
    };
    expect(shipmentMetaLine(shipment)).toBe('No carrier named');
  });

  it('joins carrier, tracking number and the date note', () => {
    const shipment: OrderShipment = {
      id: 's1',
      status: 'delivered',
      shippingCents: 599,
      carrier: 'Australia Post',
      trackingNumber: '36QT1',
      shippedAt: '2026-08-21T08:00:00Z',
      deliveredAt: '2026-08-23T15:40:00Z',
    };
    expect(shipmentMetaLine(shipment)).toMatch(/^Australia Post · 36QT1 · Delivered /);
  });
});

describe('documentStaleNote', () => {
  it('is null when the document is not stale', () => {
    const document: OrderDocument = {
      id: 'd1',
      kind: 'receipt',
      documentUri: 'pops://x',
      documentStaleAt: null,
    };
    expect(documentStaleNote(document)).toBeNull();
  });

  it('names the date it was last resolved when stale', () => {
    const document: OrderDocument = {
      id: 'd1',
      kind: 'receipt',
      documentUri: 'pops://x',
      documentStaleAt: '2026-08-24T00:00:00Z',
    };
    expect(documentStaleNote(document)).toMatch(/^Last resolved /);
  });
});
