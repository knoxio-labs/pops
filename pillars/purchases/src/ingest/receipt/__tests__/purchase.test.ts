import { describe, expect, it } from 'vitest';

import { resolveCapture } from '../capture.js';
import { ExtractedReceiptSchema } from '../extraction.js';
import { gateExtraction } from '../gate.js';
import { receiptToPurchase, RECEIPT_SOURCE_ID } from '../purchase.js';
import { receiptUri } from '../store.js';

import type { ExtractedReceipt } from '../extraction.js';
import type { GateFailure } from '../gate.js';
import type { StoredReceipt } from '../store.js';

const SHA = 'a'.repeat(64);
const STORED: StoredReceipt = {
  sha256: SHA,
  path: `/data/receipts/aa/${SHA}.jpg`,
  uri: receiptUri(SHA),
  bytes: 1234,
  alreadyPresent: false,
};

const receipt = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt =>
  ExtractedReceiptSchema.parse({
    merchantName: 'Bunnings Warehouse',
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

const UPLOADED_AT = '2026-08-06T23:11:00.000Z';

const map = (over: Partial<ExtractedReceipt> = {}, stored: StoredReceipt[] = [STORED]) => {
  const extracted = receipt(over);
  const gate = gateExtraction(extracted);
  if (!gate.admissible) throw new Error('test fixture stopped reconciling');
  return receiptToPurchase(extracted, gate, stored, { uploadedAt: UPLOADED_AT });
};

const mapped = (over: Partial<ExtractedReceipt> = {}) => map(over).purchase;

describe('receiptToPurchase invariants', () => {
  it('refuses to build a purchase with no evidence behind it', () => {
    // `receiptKey` is the first thing this function calls, and it enforces
    // the same "at least one part" invariant with its own message — so this
    // is where the empty-evidence case actually surfaces from.
    const extracted = receipt();
    const gate = gateExtraction(extracted);
    if (!gate.admissible) throw new Error('test fixture stopped reconciling');
    expect(() => receiptToPurchase(extracted, gate, [], { uploadedAt: UPLOADED_AT })).toThrow(
      'receiptKey needs at least one stored part'
    );
  });

  // Keyed by failure kind, so the compiler refuses this file the day a new
  // one is added: every way the gate can refuse a reading needs a fixture
  // here proving it actually does. `receiptToPurchase` no longer accepts a
  // reading the gate refused — `AdmissibleGate` makes that unrepresentable
  // — so what this documents is `gateExtraction`'s coverage, not a runtime
  // guard on the mapper.
  const refusedReadings: Record<GateFailure['kind'], ExtractedReceipt> = {
    'unreadable-total': receipt({ total: 'unreadable smudge' }),
    'unreadable-line': receipt({
      lines: [{ description: 'Timber Pine DAR 42x19', amount: 'a smear of ink' }],
    }),
    'no-lines': receipt({ total: '$0.00', lines: [] }),
    // The arithmetic agrees — 30.00 less 2.50 is the stated 27.50 — and the
    // total is money. Nothing but the verdict objects to this one.
    'negative-line': receipt({
      lines: [
        { description: 'Timber Pine DAR 42x19', amount: '$30.00' },
        { description: 'Member discount', amount: '-$2.50' },
      ],
    }),
    'sum-mismatch': receipt({ total: '$99.00' }),
    // The other reading whose figures are all readable and whose arithmetic
    // lands on zero: $9.95 of delivery filed in two fields at once, and
    // $9.95 is the stated tax, so counting it twice reconciles under the
    // convention this receipt was not printed under.
    'ambiguous-tax': receipt({
      total: '$47.40',
      tax: '$9.95',
      shipping: '$9.95',
      surcharges: ['$9.95'],
    }),
    // Every figure read and reconciled; the model simply could not see part
    // of the paper, so what it did not read may be a line that was there.
    damaged: receipt({ unreadable: ['the bottom third is torn away'] }),
  };

  for (const [kind, extracted] of Object.entries(refusedReadings)) {
    it(`gateExtraction refuses a reading for ${kind}`, () => {
      const gate = gateExtraction(extracted);
      expect(gate.admissible).toBe(false);
      expect(gate.failures.map((failure) => failure.kind)).toContain(kind);
    });
  }
});

describe('an admitted reading', () => {
  it('becomes an uploaded purchase with one charge for the whole receipt', () => {
    const purchase = mapped();
    expect(purchase.source).toBe(RECEIPT_SOURCE_ID);
    expect(purchase.ingestMethod).toBe('upload');
    expect(purchase.totalCents).toBe(2750);
    expect(purchase.charges).toEqual([
      { amountCents: 2750, chargedAt: purchase.orderedAt, role: 'capture', origin: 'merchant' },
    ]);
  });

  it('keys on the photograph, so a re-upload is a 409 rather than a twin', () => {
    // A till slip carries a transaction number in a different place and
    // format for every chain, and a date-plus-total key would merge two
    // identical coffees bought an hour apart.
    expect(mapped().sourceOrderId).toBe(SHA);
  });

  it('carries the photograph as a document, because it is the evidence', () => {
    const purchase = mapped();
    expect(purchase.documents).toEqual([{ documentUri: receiptUri(SHA), kind: 'receipt' }]);
    expect(purchase.rawRef).toBe(receiptUri(SHA));
  });

  it('resolves the local wall clock to an instant', () => {
    // 14:32 on 1 August in Sydney is 04:32 UTC. Read as UTC it would be
    // 14:32Z, which is the same day here but the next one for an evening
    // shop — and the reconciliation window is measured in days.
    expect(mapped().orderedAt).toBe('2026-08-01T04:32:00.000Z');
  });

  it('assumes midnight, local to the shop, when the receipt prints no time', () => {
    // A day boundary the paper does not state is the start of the day it
    // names. Safe only because the zone is the receipt's own — an inferred
    // midnight in the wrong zone lands on the adjacent day.
    expect(mapped({ purchasedAt: null }).orderedAt).toBe('2026-07-31T14:00:00.000Z');
  });

  it('places a receipt in its own timezone, not the configured one', () => {
    // Perth is two hours behind Sydney; a US receipt up to fifteen. Reading
    // every receipt as local would misplace a holiday's worth of them.
    const perth = mapped({ timeZone: 'Australia/Perth', purchasedAt: '14:32' });
    const paris = mapped({ timeZone: 'Europe/Paris', purchasedAt: '14:32' });
    expect(perth.orderedAt).toBe('2026-08-01T06:32:00.000Z');
    expect(paris.orderedAt).toBe('2026-08-01T12:32:00.000Z');
  });

  it('falls back and says so when the model names a zone that does not exist', () => {
    // The zone is the one field the model infers, so it can invent one.
    const purchase = mapped({ timeZone: 'Australia/Woolloomooloo' });
    expect(purchase.tags).toContain('timezone-uncertain');
    expect(purchase.orderedAt).toBe('2026-08-01T04:32:00.000Z');
  });

  it('accepts a real alias rather than treating it as an invention', () => {
    // `Australia/Canberra` is a genuine link to `Australia/Sydney`. Checking
    // against the runtime rather than a hand-kept list is what gets this
    // right without maintaining one.
    expect(mapped({ timeZone: 'Australia/Canberra' }).tags).not.toContain('timezone-uncertain');
  });

  it('does not claim uncertainty when the zone is real', () => {
    expect(mapped().tags).not.toContain('timezone-uncertain');
  });

  it('says it does not know how it was paid for', () => {
    // `cash` is terminal — a real card shop marked that way is excluded
    // from reconciliation forever — and the paper rarely says.
    expect(mapped().settlementMode).toBe('unknown');
    expect(mapped().paymentHint).toBeUndefined();
  });

  it('names the merchant when the receipt does, and admits it when not', () => {
    expect(mapped().merchantEntityName).toBe('Bunnings Warehouse');
    // Unknown is a valid outcome. The escape hatch exists precisely for
    // merchants nothing else recognises.
    expect(mapped({ merchantName: null }).merchantEntityName).toBeNull();
  });

  it('defaults the currency rather than refusing a receipt without one', () => {
    expect(mapped({ currency: null }).currency).toBe('AUD');
    expect(mapped({ currency: 'NZD' }).currency).toBe('NZD');
  });
});

describe('the line items', () => {
  it('carries each line with its own money', () => {
    const items = mapped().items ?? [];
    expect(items.map((i) => [i.name, i.lineTotalCents])).toEqual([
      ['Timber Pine DAR 42x19', 1250],
      ['Screws Bugle 8g 65mm', 1500],
    ]);
  });

  it('derives a unit price from a stated count', () => {
    const items = mapped({
      total: '$27.50',
      lines: [
        { description: 'Bolt M8', amount: '$12.50', quantity: 5 },
        { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
      ],
    }).items;
    expect(items?.[0]).toMatchObject({ quantity: 5, lineTotalCents: 1250, unitPriceCents: 250 });
  });

  it('treats an unstated count as one, and keeps the qualifier that says otherwise', () => {
    // A weighed line has no count. Inventing one would be wrong; dropping
    // the "0.202 kg NET @ $2.90/kg" beside it loses how much was bought.
    const items = mapped({
      total: '$12.50',
      lines: [
        { description: 'Sand Washed 20kg', amount: '$12.50', unitNote: '0.202 kg NET @ $2.90/kg' },
      ],
    }).items;
    expect(items?.[0]).toMatchObject({ quantity: 1, unitPriceCents: 1250 });
    // A note rather than a tag: the model transcribes what was printed and
    // is never asked what the product is, so the drop-zone asserts no
    // classification at all.
    expect(items?.[0]?.notes).toEqual(['0.202 kg NET @ $2.90/kg']);
    expect(items?.[0]?.tags).toBeUndefined();
  });
});

describe('the totals', () => {
  it('takes them from the gate rather than recomputing them', () => {
    // The gate already did this arithmetic and its agreement with the paper
    // is the reason the reading is admissible at all. Doing it twice is a
    // chance for the two to disagree.
    const purchase = mapped({ total: '$30.25', tax: '$2.75' });
    expect(purchase.subtotalCents).toBe(2750);
    expect(purchase.taxCents).toBe(275);
    expect(purchase.totalCents).toBe(3025);
  });

  it('carries a stated discount', () => {
    const purchase = mapped({ total: '$22.50', discounts: ['$5.00'] });
    expect(purchase.discountCents).toBe(500);
    expect(purchase.totalCents + (purchase.discountCents ?? 0)).toBe(purchase.subtotalCents);
  });

  it('writes delivery to its own column, leaving the surcharge meaning fees', () => {
    // The point of the whole change. `shippingCents` is what answers "what
    // did delivery cost this year", and the amazon adapter has always
    // written it — a delivery fee left in `surchargeCents` puts two answers
    // for the same money in one table.
    const purchase = mapped({ total: '$37.45', shipping: '$9.95' });

    expect(purchase.shippingCents).toBe(995);
    expect(purchase.surchargeCents).toBe(0);
    // Still the lines and only the lines. Delivery is not goods.
    expect(purchase.subtotalCents).toBe(2750);
    expect(purchase.totalCents).toBe(3745);
  });

  it('carries a delivery charge and a card surcharge as the separate things they are', () => {
    const purchase = mapped({ total: '$37.57', shipping: '$9.95', surcharges: ['$0.12'] });

    expect(purchase.shippingCents).toBe(995);
    expect(purchase.surchargeCents).toBe(12);
  });
});

describe('a receipt that does not say when it happened', () => {
  it('is dated from the upload and tagged, rather than refused', () => {
    // The shop happened and the photograph exists. Losing it would be worse
    // than carrying an inferred date — provided the tag stops anyone
    // mistaking that date for something the paper stated.
    const purchase = mapped({ purchasedOn: null });
    expect(purchase.orderedAt).toBe(UPLOADED_AT);
    expect(purchase.tags).toContain('date-uncertain');
  });

  it('treats a date the receipt states badly the same as none at all', () => {
    // `Date.UTC` normalises 31 February into 3 March without complaint, and
    // a normalised date is a fabrication however it arrived.
    const purchase = mapped({ purchasedOn: '2026-02-31' });
    expect(purchase.orderedAt).toBe(UPLOADED_AT);
    expect(purchase.tags).toContain('date-uncertain');
  });

  it('does not tag a receipt whose date it could read', () => {
    expect(mapped().tags).not.toContain('date-uncertain');
  });
});

/**
 * The offset the wall clock was resolved against, kept rather than thrown
 * away.
 *
 * `orderedAt` is spelled in UTC, so it is the only surviving evidence of
 * where the shop was — and without it a consumer rendering a calendar day
 * can name the day in Greenwich and nowhere else. Every case here is a
 * morning or an evening whose local day and UTC day genuinely differ,
 * because a mid-UTC-day receipt agrees with itself no matter how badly the
 * day is derived.
 */
describe('the offset an order was placed at', () => {
  /** The wall clock the pair reproduces, in `yyyy-mm-dd hh:mm`. */
  const localClockOf = (purchase: { orderedAt: string; orderedAtOffsetMinutes?: number | null }) =>
    new Date(Date.parse(purchase.orderedAt) + (purchase.orderedAtOffsetMinutes ?? 0) * 60_000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');

  it('records +10:00 for a winter Sydney morning, and reproduces the printed clock', () => {
    // 09:00 on 21 August in Sydney is 23:00 UTC on the 20th. The instant
    // alone says the 20th; the receipt in the reader's hand says the 21st.
    const purchase = mapped({ purchasedOn: '2026-08-21', purchasedAt: '09:00' });

    expect(purchase.orderedAt).toBe('2026-08-20T23:00:00.000Z');
    expect(purchase.orderedAtOffsetMinutes).toBe(600);
    expect(localClockOf(purchase)).toBe('2026-08-21 09:00');
  });

  it('records +11:00 for a summer one, following the same DST rule the instant does', () => {
    const purchase = mapped({ purchasedOn: '2026-01-21', purchasedAt: '09:00' });

    expect(purchase.orderedAt).toBe('2026-01-20T22:00:00.000Z');
    expect(purchase.orderedAtOffsetMinutes).toBe(660);
    expect(localClockOf(purchase)).toBe('2026-01-21 09:00');
  });

  it('records a negative offset for a shop west of UTC', () => {
    // The mirror case: 22:30 local runs the instant FORWARD a day, so a
    // consumer that only ever subtracts gets this one wrong in the other
    // direction.
    const purchase = mapped({
      purchasedOn: '2026-08-20',
      purchasedAt: '22:30',
      timeZone: 'America/Los_Angeles',
    });

    expect(purchase.orderedAt).toBe('2026-08-21T05:30:00.000Z');
    expect(purchase.orderedAtOffsetMinutes).toBe(-420);
    expect(localClockOf(purchase)).toBe('2026-08-20 22:30');
  });

  it('records the configured default’s offset when nothing established a zone', () => {
    // Tagged `timezone-uncertain`, and the offset is still recorded: it is
    // the same assumption `orderedAt` was resolved under, so the pair still
    // reproduces the printed clock. Recording nothing would leave a reader
    // naming the day in UTC and disagreeing with the paper outright.
    const purchase = mapped({
      purchasedOn: '2026-08-21',
      purchasedAt: '09:00',
      timeZone: null,
      address: null,
    });

    expect(purchase.tags).toContain('timezone-uncertain');
    expect(purchase.orderedAtOffsetMinutes).toBe(600);
    expect(localClockOf(purchase)).toBe('2026-08-21 09:00');
  });
});

describe('what the device and the photograph said', () => {
  const withCapture = (
    over: Partial<ExtractedReceipt>,
    client: Parameters<typeof resolveCapture>[0],
    photo: Parameters<typeof resolveCapture>[1] = null
  ) => {
    const extracted = receipt(over);
    const gate = gateExtraction(extracted);
    if (!gate.admissible) throw new Error('test fixture stopped reconciling');
    return receiptToPurchase(extracted, gate, [STORED], {
      uploadedAt: UPLOADED_AT,
      capture: resolveCapture(client, photo, extracted.timeZone),
    }).purchase;
  };

  const PHOTO = {
    localTime: { year: 2026, month: 8, day: 1, hour: 14, minute: 32, second: 7 },
    utcOffsetMinutes: 600,
    location: { latitude: -33.87, longitude: 151.21 },
  };

  it('dates an undated receipt from the shutter rather than from the upload', () => {
    // Unbounded otherwise: a receipt photographed in October and uploaded in
    // December is dated December.
    const purchase = withCapture(
      { purchasedOn: null },
      { capturedAt: '2026-08-01T14:32:07+10:00' }
    );
    expect(purchase.orderedAt).toBe('2026-08-01T04:32:07.000Z');
    expect(purchase.tags).toContain('date-uncertain');
  });

  it('keeps the tag, because a capture time is still not a stated date', () => {
    expect(withCapture({ purchasedOn: null }, undefined, PHOTO).tags).toContain('date-uncertain');
  });

  it('lets the printed date win over the capture time', () => {
    // A photo taken at the till and a photo taken at home a week later must
    // produce the same purchase date, and only the paper knows it.
    const purchase = withCapture({}, { capturedAt: '2026-08-08T09:00:00+10:00' });
    expect(purchase.orderedAt).toBe('2026-08-01T04:32:00.000Z');
    expect(purchase.tags).not.toContain('date-uncertain');
  });

  it('places the printed wall clock with the zone the client declared', () => {
    // Perth is two hours behind Sydney, which is what the model inferred
    // from the address; the device outranks it.
    const purchase = withCapture({}, { timeZone: 'Australia/Perth' });
    expect(purchase.orderedAt).toBe('2026-08-01T06:32:00.000Z');
    expect(purchase.tags).not.toContain('timezone-uncertain');
  });

  it("places it with the camera's offset when the receipt named no zone", () => {
    const purchase = withCapture({ timeZone: null }, undefined, {
      ...PHOTO,
      utcOffsetMinutes: 480,
    });
    expect(purchase.orderedAt).toBe('2026-08-01T06:32:00.000Z');
    // An offset states where the camera was, not where the shop is.
    expect(purchase.tags).toContain('timezone-uncertain');
  });

  it('carries the capture facts, each with the claimant that stated it', () => {
    const purchase = withCapture({}, { timeZone: 'Australia/Perth' }, PHOTO);
    expect(purchase.capture).toEqual({
      capturedAt: '2026-08-01T04:32:07.000Z',
      capturedAtSource: 'exif',
      utcOffsetMinutes: 600,
      declaredTimeZone: 'Australia/Perth',
      latitude: -33.87,
      longitude: 151.21,
      locationSource: 'exif',
    });
  });

  it('states nothing when nothing was supplied', () => {
    expect(mapped().capture).toEqual({
      capturedAt: null,
      capturedAtSource: null,
      utcOffsetMinutes: null,
      declaredTimeZone: null,
      latitude: null,
      longitude: null,
      locationSource: null,
    });
  });

  it('leaves the checksum alone for a fact the reading does not contain', () => {
    // A client that starts sending coordinates for uploads it already sent
    // has corrected nothing the recipe describes.
    expect(withCapture({}, { location: { latitude: 1, longitude: 2 } }).checksum).toBe(
      mapped().checksum
    );
  });

  it('moves the checksum when the capture time changes the date it settled on', () => {
    // `orderedAt` IS in the recipe, so an undated receipt that is dated from
    // the shutter hashes differently from the same receipt dated from its
    // upload. That is the recipe working: the two readings disagree about
    // when the shop happened, which is the difference the hash exists to
    // show. An undated receipt never had a stable checksum anyway — upload
    // time differs between two uploads of the same paper.
    const fromShutter = withCapture({ purchasedOn: null }, { capturedAt: '2026-08-01T14:32:07Z' });
    const fromUpload = map({ purchasedOn: null }).purchase;
    expect(fromShutter.orderedAt).not.toBe(fromUpload.orderedAt);
    expect(fromShutter.checksum).not.toBe(fromUpload.checksum);
  });
});

describe('the checksum', () => {
  it('is stable for the same photograph read the same way', () => {
    expect(mapped().checksum).toBe(mapped().checksum);
  });

  it('changes when a better reading of the same photograph changes the figures', () => {
    // Dedup is `sourceOrderId`; the checksum is change detection. Re-reading
    // one photo with a better model should look different, because it is.
    expect(mapped({ total: '$27.50' }).checksum).not.toBe(
      mapped({
        total: '$27.50',
        lines: [
          { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
          { description: 'Screws Bugle 8g 65mm (corrected)', amount: '$15.00' },
        ],
      }).checksum
    );
  });

  it('changes when a re-reading only moves the fee from surcharge to delivery', () => {
    // The exact correction this change makes possible, and the one a
    // recipe over the total and the discount cannot see: both are
    // identical between the two readings. The items are not — a surcharge
    // carries no per-item allocation, a shipping figure does (POPS-1789) —
    // so only that field of each item is expected to move.
    const asSurcharge = mapped({ total: '$37.45', surcharges: ['$9.95'] });
    const asDelivery = mapped({ total: '$37.45', shipping: '$9.95' });

    expect(asSurcharge.totalCents).toBe(asDelivery.totalCents);
    expect(asSurcharge.items?.every((item) => item.allocatedShippingCents === 0)).toBe(true);
    expect(asDelivery.items).toEqual(
      asSurcharge.items?.map((item, index) => ({
        ...item,
        allocatedShippingCents: index === 0 ? 452 : 543,
      }))
    );
    expect(asSurcharge.checksum).not.toBe(asDelivery.checksum);
  });

  it('differs between two photographs read identically', () => {
    const other = { ...STORED, sha256: 'b'.repeat(64) };
    expect(map({}, [other]).purchase.checksum).not.toBe(map().purchase.checksum);
  });

  it('differs when the same receipt is sent as more photographs', () => {
    // The key is over the whole set, so one picture of a receipt and two
    // are different submissions of it — which is what stops a second,
    // fuller set being mistaken for the first and silently dropped.
    const second = { ...STORED, sha256: 'b'.repeat(64) };
    expect(map({}, [STORED, second]).purchase.sourceOrderId).not.toBe(map().purchase.sourceOrderId);
  });

  it('carries every photograph as evidence, in order', () => {
    const second = { ...STORED, sha256: 'b'.repeat(64), uri: receiptUri('b'.repeat(64)) };
    expect(map({}, [STORED, second]).purchase.documents).toEqual([
      { documentUri: receiptUri(SHA), kind: 'receipt' },
      { documentUri: receiptUri('b'.repeat(64)), kind: 'receipt' },
    ]);
  });
});
