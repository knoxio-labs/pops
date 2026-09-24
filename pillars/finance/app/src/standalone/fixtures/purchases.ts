import { GROCER_ENTITY_ID } from './entities';

import type { PurchaseListResponses } from '../../purchases-api/types.gen';

/**
 * What the purchases pillar knows about Harbour Grocer: one receipt, settled
 * by the 4 September charge. Finance reads it for the entity page's "recent
 * purchases" card and the transactions table's link column — both surfaces
 * that must say "could not be reached" rather than go blank when purchases is
 * down.
 */

export const LINKED_TRANSACTION_ID = 'txn-hbr-0904';

export const ENTITY_PURCHASES: PurchaseListResponses[200]['items'] = [
  {
    id: 'pur-hbr-0904',
    source: 'harbour-grocer',
    sourceOrderId: 'HG-20260904-118',
    merchantEntityId: GROCER_ENTITY_ID,
    merchantEntityName: 'Harbour Grocer',
    merchantAddressId: null,
    merchantAddressName: null,
    orderedAt: '2026-09-04T09:12:00.000Z',
    orderedAtOffsetMinutes: 600,
    currency: 'AUD',
    itemCount: 7,
    subtotalCents: 8_435,
    discountCents: 0,
    discountIncluded: null,
    shippingCents: 0,
    shippingIncluded: null,
    surchargeCents: 0,
    surchargeIncluded: null,
    taxCents: 767,
    taxIncluded: true,
    totalCents: 8_435,
    status: 'linked',
    settlementMode: 'card',
    ingestMethod: 'upload',
    paymentHint: null,
    rawRef: null,
    receiptUri: null,
    checksum: 'sha256:receipt-hg-118',
    createdAt: '2026-09-04T09:30:00.000Z',
    updatedAt: '2026-09-04T09:30:00.000Z',
  },
];
