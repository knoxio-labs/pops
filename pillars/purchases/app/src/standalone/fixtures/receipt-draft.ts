/**
 * The draft a standalone reader meets before anything is saved.
 *
 * Its own file rather than a third export on `order.ts`: that file is at the
 * 200-line cap, and a fixture for a different route is not the same subject.
 */
import { ORDERED_AT } from './order';

/**
 * What extracting a receipt answers, before anything is saved.
 *
 * `ReceiptDraftSchema` is the create body minus the four provenance fields
 * (`source`, `sourceOrderId`, `ingestMethod`, `checksum`) — a draft is not
 * yet anything the pillar has agreed to keep, so it names none of them.
 * Carries `orderedAtOffsetMinutes` for the same reason the real one does:
 * the instant and the local day disagree, and dropping the offset dates a
 * morning shop to the day before.
 */
export const RECEIPT_DRAFT = {
  merchantEntityName: 'Hardware Barn',
  orderedAt: ORDERED_AT,
  orderedAtOffsetMinutes: 600,
  currency: 'AUD',
  subtotalCents: 18400,
  taxCents: 1959,
  surchargeCents: 0,
  shippingCents: 1195,
  discountCents: 500,
  totalCents: 21054,
  items: [
    {
      name: 'Timber Pine DAR 42x19',
      quantity: 4,
      unitPriceCents: 4600,
      lineTotalCents: 18400,
      notes: [],
    },
  ],
  charges: [],
  tags: [],
  documents: [],
};
