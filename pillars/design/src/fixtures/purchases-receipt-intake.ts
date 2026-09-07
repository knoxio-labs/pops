/**
 * The receipt drop zone (`/purchases/receipts`), typed locally rather than
 * imported from `pillars/purchases`: the playground is standalone, and these
 * shapes mirror the pillar's upload contract only as far as the screen reads
 * from it.
 *
 * The endpoint's own three answers are `created` (a purchase was written),
 * `needs-review` (read, but it does not add up — nothing written) and
 * `unreadable` (nothing could be read at all — nothing written). Three more
 * shapes reach the panel without being answers of that kind: `uploading`
 * while the model reads, `duplicate` for the 409 that means already on
 * record, and `refused` for an upload the pillar would not take.
 *
 * `needs-review` and `unreadable` write no purchase, which is why both carry
 * `receiptUris`: the store is then the only trace of the upload.
 */

/** One part of a receipt already staged in the browser, before submission. */
export interface StagedPart {
  readonly id: string;
  /** Null for a pasted body, which has no file behind it to name. */
  readonly name: string | null;
  readonly mediaType:
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'image/gif'
    | 'application/pdf'
    | 'text/plain';
  readonly byteLength: number;
}

/** Something that happened to a chosen file and did not end in a staged part. */
export type StagingProblem =
  | { readonly kind: 'rejected'; readonly names: readonly string[] }
  | { readonly kind: 'unreadable'; readonly names: readonly string[] }
  | { readonly kind: 'tooMany'; readonly dropped: number };

export interface ExtractedLine {
  readonly description: string;
  readonly amount: string;
  readonly quantity?: number;
  readonly unitNote?: string;
}

/** What the model read off a receipt, verbatim — every figure is the model's own text, not a parsed amount. */
export interface ExtractedReceipt {
  readonly merchantName: string | null;
  readonly address: string | null;
  readonly total: string;
  readonly currency: string | null;
  readonly purchasedOn: string | null;
  readonly purchasedAt: string | null;
  readonly timeZone: string | null;
  readonly tax: string | null;
  readonly shipping: string | null;
  readonly discounts: readonly string[];
  readonly surcharges: readonly string[];
  readonly lines: readonly ExtractedLine[];
  readonly unreadable: readonly string[];
}

export type GateFailureKind =
  | 'unreadable-total'
  | 'unreadable-line'
  | 'no-lines'
  | 'negative-line'
  | 'sum-mismatch'
  | 'ambiguous-tax'
  | 'damaged';

/** What the gate objected to. `deltaCents` is `computed - stated`, so a negative delta is short of the printed total. */
export interface GateFailure {
  readonly kind: GateFailureKind;
  readonly detail: string;
  readonly deltaCents?: number;
}

export interface CreatedPurchaseSummary {
  readonly id: string;
  readonly merchantEntityName: string | null;
  readonly totalCents: number;
  readonly currency: string;
  readonly orderedAt: string;
  readonly itemCount: number;
}

export interface CreatedOutcome {
  readonly alreadyStored: boolean;
  readonly purchase: CreatedPurchaseSummary;
}

export interface NeedsReviewOutcome {
  readonly extracted: ExtractedReceipt;
  readonly failures: readonly GateFailure[];
  readonly receiptUris: readonly string[];
}

export interface UnreadableOutcome {
  readonly reason: string;
  readonly receiptUris: readonly string[];
}

export type ReceiptSubmission =
  | { readonly state: 'idle' }
  | { readonly state: 'uploading' }
  | { readonly state: 'created'; readonly outcome: CreatedOutcome }
  | { readonly state: 'duplicate'; readonly message: string | null }
  | { readonly state: 'needs-review'; readonly outcome: NeedsReviewOutcome }
  | { readonly state: 'unreadable'; readonly outcome: UnreadableOutcome }
  | { readonly state: 'refused'; readonly message: string };

export const STAGED_PARTS: StagedPart[] = [
  {
    id: 'staged-part-1',
    name: 'woolworths-receipt.jpg',
    mediaType: 'image/jpeg',
    byteLength: 2_147_600,
  },
  {
    id: 'staged-part-2',
    name: 'woolworths-receipt-cont.jpg',
    mediaType: 'image/jpeg',
    byteLength: 1_884_200,
  },
  { id: 'staged-part-3', name: null, mediaType: 'text/plain', byteLength: 412 },
];

/**
 * A receipt already at the eight-part bound, which is the only way parts can
 * be dropped: a ninth and tenth frame have nowhere to go, and the overflow is
 * reported rather than trimmed in silence.
 */
export const FULL_STAGED_PARTS: StagedPart[] = Array.from(
  { length: 8 },
  (_, index): StagedPart => ({
    id: `full-part-${index + 1}`,
    name: `woolworths-receipt-${index + 1}.jpg`,
    mediaType: 'image/jpeg',
    byteLength: 1_900_000 + index * 24_000,
  })
);

/**
 * What one gesture left behind: a file whose type the upload does not take,
 * one the device would not hand over, and two frames that arrived after the
 * bound was already reached.
 */
export const STAGING_PROBLEMS: StagingProblem[] = [
  { kind: 'rejected', names: ['receipt.heic'] },
  { kind: 'unreadable', names: ['blurred-frame.jpg'] },
  { kind: 'tooMany', dropped: 2 },
];

export const CREATED_SUBMISSION: ReceiptSubmission = {
  state: 'created',
  outcome: {
    alreadyStored: false,
    purchase: {
      id: 'pur_01JQ8XN4E7K2M9V3ZB6TYD',
      merchantEntityName: 'Woolworths Metro',
      totalCents: 8_423,
      currency: 'AUD',
      orderedAt: '2026-08-19T09:14:00+10:00',
      itemCount: 12,
    },
  },
};

/**
 * Read and recorded, but the bytes were already in the store — a second
 * upload of a frame the pillar had kept. The purchase is the answer either
 * way, and the panel says which so a reader is not left wondering whether
 * they have just filed the same receipt twice.
 */
export const CREATED_ALREADY_STORED_SUBMISSION: ReceiptSubmission = {
  state: 'created',
  outcome: {
    alreadyStored: true,
    purchase: {
      id: 'pur_01JQ8W2M6B4H7C1XKD9PFA',
      merchantEntityName: 'Kmart Broadway',
      totalCents: 3_100,
      currency: 'AUD',
      orderedAt: '2026-08-20T17:42:00+10:00',
      itemCount: 3,
    },
  },
};

export const DUPLICATE_SUBMISSION: ReceiptSubmission = {
  state: 'duplicate',
  message:
    'This receipt was uploaded on 19 Aug and already recorded as pur_01JQ8XN4E7K2M9V3ZB6TYD.',
};

/**
 * The twelve lines below sum to 76.04, and with the adjustments (+7.66 tax,
 * -2.00 discount, +0.03 surcharge) to 81.73 — 2.50 short of the 84.23 the
 * receipt prints. The gate reports `computed - stated`, so the delta is
 * -250 cents: this arithmetic has to hold, because the disagreement between
 * the lines and the printed total is the entire reason this state exists.
 */
export const NEEDS_REVIEW_SUBMISSION: ReceiptSubmission = {
  state: 'needs-review',
  outcome: {
    receiptUris: [
      's3://pops-receipts/2026/08/19/a1b2c3d4.jpg',
      's3://pops-receipts/2026/08/19/e5f6a7b8.jpg',
    ],
    failures: [
      {
        kind: 'sum-mismatch',
        detail:
          'lines total 7604c less 200c discounts plus 3c surcharges plus 0c shipping is 8173c with 766c tax added, but the receipt states 8423c',
        deltaCents: -250,
      },
      { kind: 'unreadable-line', detail: 'One line below the eggs could not be read' },
    ],
    extracted: {
      merchantName: 'Woolworths Metro',
      address: '412 Crown Street, Surry Hills NSW',
      total: '84.23',
      currency: 'AUD',
      purchasedOn: '2026-08-19',
      purchasedAt: '09:14',
      timeZone: 'Australia/Sydney',
      tax: '7.66',
      shipping: null,
      discounts: ['2.00'],
      surcharges: ['0.03'],
      unreadable: ['The line under the eggs is torn away.'],
      lines: [
        { description: 'Full cream milk 2L', amount: '4.50', quantity: 2 },
        { description: 'Sourdough loaf', amount: '6.00' },
        { description: 'Royal gala apples', amount: '7.84', unitNote: '$4.90/kg' },
        { description: 'Free range eggs 12pk', amount: '9.20' },
        { description: 'Greek yoghurt 1kg', amount: '5.50' },
        { description: 'Baby spinach 120g', amount: '3.20' },
        { description: 'Scotch fillet', amount: '12.00', unitNote: '$39.00/kg' },
        { description: 'Cherry tomatoes 250g', amount: '4.80' },
        { description: 'Tinned chickpeas', amount: '2.90', quantity: 2 },
        { description: 'Extra virgin olive oil 500ml', amount: '6.60' },
        { description: 'Parmigiano wedge', amount: '8.50' },
        { description: 'Laundry liquid 1L', amount: '5.00' },
      ],
    },
  },
};

export const UNREADABLE_SUBMISSION: ReceiptSubmission = {
  state: 'unreadable',
  outcome: {
    reason: 'The image is too blurred for any line to be read.',
    receiptUris: ['s3://pops-receipts/2026/08/19/c9d8e7f6.jpg'],
  },
};

export const REFUSED_SUBMISSION: ReceiptSubmission = {
  state: 'refused',
  message: 'The upload service is unavailable. Try again in a moment.',
};

// More `ReceiptSubmission` fixtures — the review-gate failures and the
// upload refusal — live in ./purchases-receipt-intake-review.
