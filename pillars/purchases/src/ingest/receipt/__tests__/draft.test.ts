/**
 * Shaping a reading into fields a reviewer edits (POPS-2454).
 *
 * `receiptToPurchase` only accepts a reading the arithmetic gate admitted,
 * because an admissible reading is the only kind that may become a fact
 * unseen. `shapeReceiptDraft` exists for the other arm: a human is about to
 * look at it, so an inadmissible reading must still arrive as editable
 * numbers rather than as a refusal.
 *
 * The total is the field that matters most here. It is what a person checks
 * first, and each of its three sources is a different claim about what is
 * known — so each is asserted separately rather than through whichever one
 * a happy-path fixture happens to take.
 */
import { describe, expect, it } from 'vitest';

import { resolveCapture } from '../capture.js';
import { shapeReceiptDraft } from '../draft.js';
import { ExtractedReceiptSchema } from '../extraction.js';
import { gateExtraction } from '../gate.js';
import { receiptUri } from '../store.js';

import type { ExtractedReceipt } from '../extraction.js';
import type { StoredReceipt } from '../store.js';

const SHA = 'b'.repeat(64);
const STORED: StoredReceipt = {
  sha256: SHA,
  path: `/data/receipts/bb/${SHA}.jpg`,
  uri: receiptUri(SHA),
  bytes: 2048,
  alreadyPresent: false,
};

const UPLOADED_AT = '2026-08-06T23:11:00.000Z';

const receipt = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt =>
  ExtractedReceiptSchema.parse({
    merchantName: 'Padaria Sao Jorge',
    purchasedOn: '2026-08-01',
    purchasedAt: '14:32',
    currency: 'AUD',
    address: '123 Example St, Sydney NSW',
    timeZone: 'Australia/Sydney',
    total: '$27.50',
    tax: null,
    discounts: [],
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
    ],
    unreadable: [],
    ...over,
  });

const shape = (over: Partial<ExtractedReceipt> = {}) => {
  const extracted = receipt(over);
  return {
    gate: gateExtraction(extracted),
    draft: shapeReceiptDraft(extracted, gateExtraction(extracted), [STORED], {
      uploadedAt: UPLOADED_AT,
    }),
  };
};

describe('shapeReceiptDraft — the total a reviewer starts from', () => {
  it('uses the gate figure verbatim when the reading is admissible', () => {
    const { gate, draft } = shape();

    expect(gate.admissible).toBe(true);
    expect(draft.totalCents).toBe(2750);
  });

  it('falls back to the printed total when the arithmetic did not agree', () => {
    // The lines sum to $27.50 and the paper says $30.00. The gate refuses,
    // and the person correcting it starts from what is PRINTED — that is
    // the number in front of them.
    const { gate, draft } = shape({ total: '$30.00' });

    expect(gate.admissible).toBe(false);
    expect(draft.totalCents).toBe(3000);
  });

  it('falls back to the components when even the printed total will not parse', () => {
    // A smudged total. The components the gate did read are the only
    // figures left, so the reviewer starts from their sum rather than from
    // zero or from a refusal.
    const { gate, draft } = shape({ total: 'illegible' });

    expect(gate.admissible).toBe(false);
    expect(draft.totalCents).toBe(2750);
  });
});

describe('shapeReceiptDraft — what a draft carries', () => {
  it('carries no provenance, because nothing has agreed to keep it yet', () => {
    const { draft } = shape();

    // `source`, `ingestMethod`, `checksum` and `sourceOrderId` are the save
    // path's to decide. A draft naming them would be claiming a record it
    // is not.
    expect(draft).not.toHaveProperty('source');
    expect(draft).not.toHaveProperty('ingestMethod');
    expect(draft).not.toHaveProperty('checksum');
    expect(draft).not.toHaveProperty('sourceOrderId');
  });

  it('links the stored pages it was read off', () => {
    const { draft } = shape();

    expect(draft.documents).toEqual([{ documentUri: STORED.uri, kind: 'receipt' }]);
  });

  it('shapes every line, admissible or not', () => {
    const { gate, draft } = shape({ total: '$30.00' });

    expect(gate.admissible).toBe(false);
    expect(draft.items).toHaveLength(2);
    expect(draft.items.map((item) => item.name)).toEqual([
      'Timber Pine DAR 42x19',
      'Screws Bugle 8g 65mm',
    ]);
  });

  it('gives the items mutable arrays, because a draft is a wire value', () => {
    const { draft } = shape();
    const [first] = draft.items;

    // `CreateItemInput` declares these readonly for the DB-write path it
    // also serves; the wire schema infers plain arrays. A draft that handed
    // back the readonly ones would not parse.
    expect(Array.isArray(first?.tags ?? [])).toBe(true);
    expect(Array.isArray(first?.notes ?? [])).toBe(true);
  });

  it('resolves a capture even when the caller supplies none', () => {
    const { draft } = shape();

    expect(draft.capture).toBeDefined();
    expect(draft.orderedAt).toBeDefined();
  });
});

describe('shapeReceiptDraft — what the reading could not settle', () => {
  it('tags a draft whose date nothing could read, and dates it from the upload', () => {
    // No date on the paper and no capture to borrow one from. The draft
    // still has to carry a date, so it takes the upload's — and says so,
    // rather than presenting a guess as the receipt's own.
    const { draft } = shape({ purchasedOn: null, purchasedAt: null });

    expect(draft.tags).toContain('date-uncertain');
    expect(draft.orderedAt).toBe(UPLOADED_AT);
  });

  it('tags a draft whose timezone was not certain', () => {
    // No address, so nothing pins the zone. The offset is still written,
    // because a draft needs one, and the tag is what stops it being read
    // as established.
    const { draft } = shape({ address: null, timeZone: null });

    expect(draft.tags).toContain('timezone-uncertain');
  });

  it('drops a line whose amount will not parse, keeping the ones that will', () => {
    const { draft } = shape({
      lines: [
        { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
        { description: 'Smudged', amount: 'illegible' },
      ],
    });

    expect(draft.items.map((item) => item.name)).toEqual(['Timber Pine DAR 42x19']);
  });

  it('infers an unstated currency from the zone, and marks it uncertain', () => {
    // A Sydney address is a real signal, so the draft carries AUD — but as a
    // guess, tagged, rather than as something the receipt said.
    const { draft } = shape({ currency: null });

    expect(draft.currency).toBe('AUD');
    expect(draft.tags).toContain('currency-uncertain');
  });

  it('leaves a currency nothing could resolve as unresolved, not AUD', () => {
    // No stated currency and no zone: the old default would have filed a BRL
    // slip as AUD, off by roughly three times (POPS-3570).
    const { draft } = shape({ currency: null, address: null, timeZone: null });

    expect(draft.currency).toBe('XXX');
    expect(draft.tags).toContain('currency-uncertain');
  });

  it('does not mark a currency the receipt stated', () => {
    const { draft } = shape();

    expect(draft.tags).not.toContain('currency-uncertain');
  });
});

describe('shapeReceiptDraft — context defaults', () => {
  it('dates the draft from now when the caller supplies no upload time', () => {
    const before = Date.now();
    const extracted = receipt({ purchasedOn: null, purchasedAt: null });
    const draft = shapeReceiptDraft(extracted, gateExtraction(extracted), [STORED]);

    expect(Date.parse(draft.orderedAt)).toBeGreaterThanOrEqual(before);
  });

  it('uses a capture the caller resolved rather than resolving its own', () => {
    // The phone said when and where it photographed this, so the zone is
    // known rather than guessed off an address — and an undated receipt
    // takes the shutter's moment instead of the upload's.
    const extracted = receipt({ purchasedOn: null, purchasedAt: null });
    const capture = resolveCapture(
      { capturedAt: '2026-07-04T01:02:03.000Z', timeZone: 'Australia/Perth' },
      null,
      extracted.timeZone
    );
    const draft = shapeReceiptDraft(extracted, gateExtraction(extracted), [STORED], {
      uploadedAt: UPLOADED_AT,
      capture,
    });

    expect(draft.orderedAt).toBe(capture.capturedAt);
    expect(draft.tags).not.toContain('timezone-uncertain');
  });
});
