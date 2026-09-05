/**
 * A photographed receipt at each of the three outcomes the pillar returns —
 * a purchase it recorded, a reading it will not record without a person, and
 * an image it could not read at all.
 *
 * Amounts are the extractor's own printed strings, not numbers: what the
 * paper says is the fact under review, and parsing it here would hide the
 * disagreement between the lines and the total that the whole needs-review
 * screen exists to show.
 */
export interface ReceiptLine {
  /** The line's own identity: two lines of a receipt can print identically. */
  id: string;
  description: string;
  amount: string;
  quantity?: number;
  unitNote?: string;
}

export interface ExtractedReceipt {
  merchant?: string;
  address?: string;
  purchasedOn?: string;
  purchasedAt?: string;
  currency: string;
  total?: string;
  tax?: string;
  discounts: string[];
  surcharges: string[];
  shipping?: string;
  lines: ReceiptLine[];
  unreadableNotes: string[];
}

export type GateFailureKind =
  | 'unreadableTotal'
  | 'unreadableLine'
  | 'noLines'
  | 'negativeLine'
  | 'sumMismatch'
  | 'ambiguousTax'
  | 'damaged'
  | 'unrecognised';

export interface GateFailure {
  kind: GateFailureKind;
  detail: string;
  /** Sum mismatches only: negative is short of the printed total. */
  deltaCents?: number;
}

export const woolworthsReading: ExtractedReceipt = {
  merchant: 'Woolworths Metro',
  address: '412 Crown Street, Surry Hills NSW',
  purchasedOn: '2026-08-19',
  purchasedAt: '09:14',
  currency: 'AUD',
  total: '84.23',
  tax: '7.66',
  discounts: ['2.00'],
  surcharges: ['0.03'],
  lines: [
    { id: 'w1', description: 'Full cream milk 2L', amount: '4.50', quantity: 2 },
    { id: 'w2', description: 'Sourdough loaf', amount: '6.00' },
    { id: 'w3', description: 'Royal gala apples', amount: '7.84', unitNote: '$4.90/kg' },
    { id: 'w4', description: 'Free range eggs 12pk', amount: '9.20' },
    { id: 'w5', description: 'Greek yoghurt 1kg', amount: '5.50' },
    { id: 'w6', description: 'Baby spinach 120g', amount: '3.20' },
    { id: 'w7', description: 'Scotch fillet', amount: '12.00', unitNote: '$39.00/kg' },
    { id: 'w8', description: 'Cherry tomatoes 250g', amount: '4.80' },
    { id: 'w9', description: 'Tinned chickpeas', amount: '2.90', quantity: 2 },
    { id: 'w10', description: 'Extra virgin olive oil 500ml', amount: '6.60' },
    { id: 'w11', description: 'Parmigiano wedge', amount: '8.50' },
    { id: 'w12', description: 'Laundry liquid 1L', amount: '5.00' },
  ],
  unreadableNotes: ['The line under the eggs is torn away.'],
};

/**
 * The twelve lines above come to 76.04, and with the adjustments (+7.66 tax,
 * -2.00 discount, +0.03 surcharge) to 81.73 — 2.50 short of the 84.23 the
 * receipt printed. The arithmetic has to hold: a reviewer looking at the
 * needs-review screen adds the visible column up, and a mismatch this fixture
 * only claims is one the screen cannot be judged on.
 */
export const woolworthsFailures: GateFailure[] = [
  {
    kind: 'sumMismatch',
    detail: 'Lines and adjustments came to 81.73 against a printed 84.23',
    deltaCents: -250,
  },
  { kind: 'unreadableLine', detail: 'One line below the eggs could not be read' },
];

/**
 * A clean read worth improving: nothing failed, and every name is the till's
 * rather than a person's. This is the fixture the draft form exists for.
 */
export const kmartReading: ExtractedReceipt = {
  merchant: 'Kmart Broadway',
  address: '1 Bay Street, Broadway NSW',
  purchasedOn: '2026-08-20',
  purchasedAt: '17:42',
  currency: 'AUD',
  total: '31.00',
  discounts: [],
  surcharges: [],
  lines: [
    { id: 'k1', description: 'ZCHEETOS C&B BALLS', amount: '4.00' },
    { id: 'k2', description: 'ZSOFT TCH BLK TRAY', amount: '12.00' },
    { id: 'k3', description: 'ZIRONING BOARD', amount: '15.00' },
  ],
  unreadableNotes: [],
};

/** The purchase the pillar recorded, with the only formatted money on any of these screens. */
export const createdPurchase = {
  id: 'pur_01JQ8XN4E7K2M9V3ZB6TYD',
  merchant: 'Woolworths Metro',
  orderedOn: '2026-08-19',
  totalMinorUnits: 8_423,
  currency: 'AUD',
  itemCount: 12,
};

export const unreadableReason = 'The image is too blurred for any line to be read.';
