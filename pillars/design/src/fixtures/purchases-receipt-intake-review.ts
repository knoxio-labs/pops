/**
 * Split out of `purchases-receipt-intake.ts` (which was at the file-length
 * limit): the review-gate and upload-refusal submissions the drop zone's
 * `needs-review` and `refused` states cover but the base fixture set does
 * not.
 */
import type { ReceiptSubmission } from './purchases-receipt-intake';

/**
 * The same disagreement as `NEEDS_REVIEW_SUBMISSION`, but the receipt
 * itself never states a currency: a pasted order confirmation with no
 * symbol and no code, say. `deltaCents` still holds, so the panel's `Delta`
 * has to fall back to a bare-cents figure rather than calling `formatCents`
 * with nothing to format it in.
 */
export const NEEDS_REVIEW_NO_CURRENCY_SUBMISSION: ReceiptSubmission = {
  state: 'needs-review',
  outcome: {
    receiptUris: ['s3://pops-receipts/2026/08/22/f1a2b3c4.txt'],
    failures: [
      {
        kind: 'sum-mismatch',
        detail: 'lines total 1200c plus 150c shipping is 1350c, but the order states 1500c',
        deltaCents: -150,
      },
    ],
    extracted: {
      merchantName: 'Riverside Print Co',
      address: null,
      total: '15.00',
      currency: null,
      purchasedOn: '2026-08-22',
      purchasedAt: null,
      timeZone: null,
      tax: null,
      shipping: '1.50',
      discounts: [],
      surcharges: [],
      unreadable: [],
      lines: [
        { description: 'A4 flyers, 250 pack', amount: '9.00' },
        { description: 'Business cards, 100 pack', amount: '3.00' },
      ],
    },
  },
};

/**
 * The gate's `no-lines` objection: the model made out a total and a
 * merchant, but not a single line underneath it, so there is nothing to sum
 * against that total. This is the one review failure that carries no
 * `deltaCents` of its own: there is no computed side of the arithmetic to
 * compare it against.
 */
export const NEEDS_REVIEW_NO_LINES_SUBMISSION: ReceiptSubmission = {
  state: 'needs-review',
  outcome: {
    receiptUris: ['s3://pops-receipts/2026/08/23/aa11bb22.jpg'],
    failures: [
      {
        kind: 'no-lines',
        detail: 'The total and merchant were read, but no line beneath them could be made out',
      },
    ],
    extracted: {
      merchantName: 'Coles Express',
      address: '88 Regent Street, Redfern NSW',
      total: '23.50',
      currency: 'AUD',
      purchasedOn: '2026-08-23',
      purchasedAt: '18:02',
      timeZone: 'Australia/Sydney',
      tax: null,
      shipping: null,
      discounts: [],
      surcharges: [],
      unreadable: ['The itemised section is a single smeared block.'],
      lines: [],
    },
  },
};

/**
 * The 413 the transport gives back for a part over the pillar's own limit,
 * modelled as the same `refused` shape as `REFUSED_SUBMISSION` rather than a
 * new state, because to this screen a rejection at the transport and a
 * rejection at the receipt gate read identically: nothing was staged,
 * nothing was sent, and the message is the only thing that differs.
 */
export const OVERSIZED_UPLOAD_SUBMISSION: ReceiptSubmission = {
  state: 'refused',
  message:
    '413: this receipt is larger than the upload will accept. Split it into smaller parts and try again.',
};
