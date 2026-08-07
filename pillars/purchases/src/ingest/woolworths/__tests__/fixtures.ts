/**
 * Receipt payloads shaped exactly like the live `ActivityDetails` response.
 *
 * Every block name, field name and string format here was read off the real
 * API rather than invented — including the EFTPOS slip, whose values are
 * replaced with equally-shaped fakes because the tests that matter most are
 * the ones asserting those values never reach the database.
 */

interface Line {
  __typename?: string;
  prefixChar?: string | null;
  description?: string | null;
  amount?: string | null;
}

const line = (description: string, amount: string, prefixChar: string | null = null): Line => ({
  __typename: 'ReceiptDetailsLineItem',
  prefixChar,
  description,
  amount,
});

/** The seven rows of a real shop: five products, one bought twice. */
export const REAL_RECEIPT_LINES: Line[] = [
  line('Essentials Grated Parmesan Cheese 100g', '2.00'),
  line('WW Cage Free Eggs XL 12pk 700g', '5.70'),
  line('WW Cheese Slices Smoky 250g', '3.80'),
  line('Woolworths Turkish Rolls 400g Pk 4', '2.60'),
  line('Thomas Dux Smoked Salmon Slices 300g', ''),
  line('Qty 2 @ $9.24 each', '18.48'),
  line('PRICE REDUCED BY $7.26 each', ''),
];

/** The terminal slip, field for field, with fabricated values. */
export const CARD_SLIP: string[] = [
  '-------------------------',
  'WOOLWORTHS       1034     ',
  'CANTERBURY         NSW',
  'MERCH ID:611000602001034',
  'AMERICAN EXPRESS',
  'AID           A00000002501090 1',
  'TVR                   0000008000',
  'ARQC      106CBC37A006B0BA',
  'ATC                       0054  ',
  'PSN                         00',
  '24/07/26 20:39     003184',
  'TERM ID:         W1034066',
  'CARD: .............6895   T',
  'PURCHASE            $32.58',
  '------------',
  'TOTAL               $32.58',
  'APPROVED                 00',
  '-------------------------',
];

export interface ReceiptOptions {
  readonly lines?: Line[];
  readonly total?: string;
  readonly gst?: string;
  readonly discounts?: Line[];
  readonly transactionDetails?: string | null;
  /** `null` omits it, the way a receipt with no store number would. */
  readonly storeNo?: string | null;
  readonly storeTitle?: string;
  readonly payments?: unknown[];
}

export const cardPayment = (amount: string, slip: string[] = CARD_SLIP): unknown => ({
  __typename: 'ReceiptDetailsPayment',
  description: 'X-6895',
  amount,
  details: slip.map((text) => ({ __typename: 'ReceiptDetailsPaymentInfo', text })),
});

export const changeRow = (amount = '$0.00'): unknown => ({
  __typename: 'ReceiptDetailsPayment',
  description: 'Change',
  amount,
  details: [],
});

/** A `ReceiptDetails` page, with the marketing coupon blocks included. */
export function receiptPage(options: ReceiptOptions = {}): {
  details: unknown[];
  download: { url: string; filename: string };
} {
  const lines = options.lines ?? REAL_RECEIPT_LINES;
  const total = options.total ?? '$32.58';
  const details = options.transactionDetails;

  return {
    download: { url: 'https://example.invalid/receipt.pdf', filename: 'receipt.pdf' },
    details: [
      {
        __typename: 'ReceiptDetailsHeader',
        iconUrl: 'https://example.invalid/logo.png',
        title: options.storeTitle ?? '1034 Canterbury Plaza',
        content: '2A Charles St',
        division: 'SUPERMARKETS',
        storeNo: options.storeNo === undefined ? '1034' : options.storeNo,
      },
      { __typename: 'ReceiptDetailsTotal', total },
      {
        __typename: 'ReceiptDetailsItems',
        header: line('Description', '$'),
        items: lines,
      },
      {
        __typename: 'ReceiptDetailsSummary',
        discounts: options.discounts ?? [],
        summaryItems: [],
        gst: line('#Total includes GST', options.gst ?? '$2.96'),
        receiptTotal: line(`TOTAL (${String(lines.length)} items)`, total),
      },
      {
        __typename: 'ReceiptDetailsPayments',
        payments: options.payments ?? [cardPayment(total), changeRow()],
      },
      {
        __typename: 'ReceiptDetailsCoupon',
        headerImageUrl: null,
        footer: null,
        sections: [],
        barcode: null,
      },
      {
        __typename: 'ReceiptDetailsFooter',
        barcode: {
          __typename: 'ReceiptDetailsBarcode',
          type: 'Code128',
          value: '6291034066318424 0726',
        },
        transactionDetails:
          details === undefined ? 'POS   066   TRANS   3184     20:39     24/07/2026' : details,
        abnAndStore: 'ABN 88 000 014 675, STORE 1034\n  WOOLWORTHS GROUP LIMITED',
      },
    ],
  };
}

export function exportFile(receipts: { id: string; page: unknown }[]): unknown {
  return {
    source: 'woolworths-everyday-rewards',
    formatVersion: 1,
    capturedAt: '2026-08-07T00:11:00.000Z',
    receipts: receipts.map(({ id, page }) => ({
      activityDetailsId: id,
      listRow: null,
      receipt: page,
    })),
  };
}
