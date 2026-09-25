/**
 * The charges, links and accounting split `purchases` hangs off an order's
 * detail, as fixtures for the bank-match tests (POPS-4646).
 */

/** A charge link as `PurchaseChargeLinkSchema` serves one — no descriptor, by the producer's design. */
export interface PurchasesFakeLink {
  id: string;
  chargeId: string;
  transactionUri: string;
  amountCents: number;
  linkType: string;
  confidence: number;
  matchRuleId: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

/** One `charges[]` entry, nested as `PurchaseChargeDetailSchema` sends it. */
export interface PurchasesFakeCharge {
  charge: {
    id: string;
    purchaseId: string;
    shipmentId: string | null;
    sourceChargeRef: string | null;
    position: number;
    amountCents: number;
    currency: string;
    orderAmountCents: number;
    chargedAt: string | null;
    role: string;
    paymentHint: string | null;
    origin: string;
    createdAt: string;
    updatedAt: string;
  };
  links: PurchasesFakeLink[];
  allocations: unknown[];
}

export interface PurchasesFakeAccounting {
  totalCents: number;
  matchedCents: number;
  awaitingImportCents: number;
  residualCents: number;
  refundedCents: number;
  netSpendCents: number;
}

/** The split of an order nothing has matched yet: all of it awaiting import. */
export function awaitingAccounting(totalCents: number): PurchasesFakeAccounting {
  return {
    totalCents,
    matchedCents: 0,
    awaitingImportCents: totalCents,
    residualCents: 0,
    refundedCents: 0,
    netSpendCents: totalCents,
  };
}

export function fakeLink(
  overrides: Partial<PurchasesFakeLink> & { id: string }
): PurchasesFakeLink {
  return {
    chargeId: 'chg-1',
    transactionUri: 'pops://finance/transaction/tx-1',
    amountCents: 24_900,
    linkType: 'exact',
    confidence: 1,
    matchRuleId: null,
    createdAt: '2026-09-03T00:00:00.000Z',
    confirmedAt: null,
    ...overrides,
  };
}

export function fakeCharge(
  overrides: Partial<PurchasesFakeCharge['charge']> & { id: string },
  links: PurchasesFakeLink[]
): PurchasesFakeCharge {
  return {
    charge: {
      purchaseId: 'pur-1',
      shipmentId: null,
      sourceChargeRef: null,
      position: 0,
      amountCents: 24_900,
      currency: 'AUD',
      orderAmountCents: 24_900,
      chargedAt: '2026-09-01T22:30:00.000Z',
      role: 'capture',
      paymentHint: null,
      origin: 'merchant',
      createdAt: '2026-09-01T22:30:00.000Z',
      updatedAt: '2026-09-01T22:30:00.000Z',
      ...overrides,
    },
    links,
    allocations: [],
  };
}
