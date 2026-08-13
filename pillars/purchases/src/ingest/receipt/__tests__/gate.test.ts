import { describe, expect, it } from 'vitest';

import { ExtractedReceiptSchema } from '../extraction.js';
import { gateExtraction } from '../gate.js';

import type { ExtractedReceipt } from '../extraction.js';

const receipt = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt =>
  ExtractedReceiptSchema.parse({
    merchantName: 'Bunnings Warehouse',
    purchasedOn: '2026-08-01',
    purchasedAt: '14:32',
    currency: 'AUD',
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

describe('a reading that agrees with the paper', () => {
  it('is admissible', () => {
    const result = gateExtraction(receipt());
    expect(result.admissible).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.lineTotalCents).toBe(2750);
    expect(result.totalCents).toBe(2750);
  });

  it('adds stated tax rather than assuming it is already in the lines', () => {
    // A receipt that separates tax has lines that exclude it. Assuming
    // either convention breaks the other country's receipts.
    const result = gateExtraction(receipt({ total: '$30.25', tax: '$2.75' }));
    expect(result.admissible).toBe(true);
    expect(result.taxCents).toBe(275);
  });

  it('subtracts stated discounts', () => {
    const result = gateExtraction(receipt({ total: '$22.50', discounts: ['$5.00'] }));
    expect(result.admissible).toBe(true);
    expect(result.discountCents).toBe(500);
  });

  it('reads a discount stated as a negative the same as a positive', () => {
    const negative = gateExtraction(receipt({ total: '$22.50', discounts: ['-$5.00'] }));
    expect(negative.admissible).toBe(true);
    expect(negative.discountCents).toBe(500);
  });
});

describe('a reading that does not', () => {
  it('is refused, with the discrepancy stated in cents', () => {
    // The whole point. A model reading a crumpled receipt is confidently
    // wrong often enough that its output cannot be trusted on its own —
    // but the receipt states its own answer, so it does not have to be.
    const result = gateExtraction(receipt({ total: '$99.99' }));
    expect(result.admissible).toBe(false);
    const mismatch = result.failures.find((f) => f.kind === 'sum-mismatch');
    expect(mismatch?.deltaCents).toBe(2750 - 9999);
    expect(mismatch?.detail).toContain('9999c');
  });

  it('does not accept a reading that is out by a single cent', () => {
    // Any tolerance wide enough to absorb rounding is wide enough to absorb
    // a misread digit, and a misread digit is worth at least ten cents.
    const result = gateExtraction(receipt({ total: '$27.51' }));
    expect(result.admissible).toBe(false);
  });

  it('refuses a total it cannot read as money', () => {
    const result = gateExtraction(receipt({ total: 'TOTAL' }));
    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toContain('unreadable-total');
    expect(result.totalCents).toBeNull();
  });

  it('names the line it could not read, by position and description', () => {
    // A reviewer holding the photo needs to know which line to look at.
    const result = gateExtraction(
      receipt({
        lines: [
          { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
          { description: 'Screws Bugle 8g 65mm', amount: 'SMUDGED' },
        ],
      })
    );
    const failure = result.failures.find((f) => f.kind === 'unreadable-line');
    expect(failure?.detail).toContain('line 2');
    expect(failure?.detail).toContain('Screws Bugle 8g 65mm');
  });

  it('refuses a receipt with a total and no lines', () => {
    // It reconciles trivially against nothing, so without this the emptiest
    // possible reading is also the most confident one.
    const result = gateExtraction(receipt({ lines: [], total: '$0.00' }));
    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toContain('no-lines');
  });

  it('refuses a receipt the model admits it could not fully read', () => {
    // The sum can still agree while a torn line is missing from both sides
    // of it. The reviewer needs "the receipt is damaged" told apart from
    // "the model is wrong".
    const result = gateExtraction(receipt({ unreadable: ['the third line is torn'] }));
    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toEqual(['damaged']);
  });

  it('refuses a stated tax it cannot read as money', () => {
    const result = gateExtraction(receipt({ tax: 'TAX' }));
    expect(result.admissible).toBe(false);
    const failure = result.failures.find((f) => f.kind === 'unreadable-line');
    expect(failure?.detail).toContain('stated tax "TAX" is not money');
  });

  it('refuses a stated discount it cannot read as money', () => {
    const result = gateExtraction(receipt({ discounts: ['SAVINGS'] }));
    expect(result.admissible).toBe(false);
    const failure = result.failures.find((f) => f.kind === 'unreadable-line');
    expect(failure?.detail).toContain('stated discount "SAVINGS" is not money');
  });

  it('refuses a stated surcharge it cannot read as money', () => {
    const result = gateExtraction(receipt({ surcharges: ['FEE'] }));
    expect(result.admissible).toBe(false);
    const failure = result.failures.find((f) => f.kind === 'unreadable-line');
    expect(failure?.detail).toContain('stated surcharge "FEE" is not money');
  });

  it('reports everything wrong with it, not just the first thing', () => {
    const result = gateExtraction(
      receipt({
        total: 'TOTAL',
        lines: [{ description: 'Something', amount: 'SMUDGED' }],
        unreadable: ['bottom corner missing'],
      })
    );
    expect(result.failures.map((f) => f.kind).toSorted()).toEqual([
      'damaged',
      'unreadable-line',
      'unreadable-total',
    ]);
  });
});

describe('what the gate cannot catch, and does not pretend to', () => {
  it('accepts a reading whose descriptions are wrong but whose money is right', () => {
    // Stated so the limit is explicit: this checks arithmetic, not reading
    // comprehension. A model that transcribes every amount correctly and
    // every product name badly passes, and should — the money is what
    // reconciliation and spend analysis run on, and a wrong name is visible
    // to a human in a way a wrong cent is not.
    const result = gateExtraction(
      receipt({
        lines: [
          { description: 'aaaa', amount: '$12.50' },
          { description: 'bbbb', amount: '$15.00' },
        ],
      })
    );
    expect(result.admissible).toBe(true);
  });
});

describe('a discount the model filed among the lines', () => {
  it('is refused, even though the arithmetic reconciles', () => {
    // This is the case nothing else here would catch. Σ lines still equals
    // the stated total, so the sum check is satisfied and the reading looks
    // admissible — while the purchase it produces carries an item worth
    // less than nothing, and per-item spend silently nets out.
    const misfiled = receipt({
      total: '$8.00',
      lines: [
        { description: 'Timber Pine DAR 42x19', amount: '$10.00' },
        { description: 'MEMBER DISCOUNT', amount: '-$2.00' },
      ],
    });

    const result = gateExtraction(misfiled);

    expect(result.admissible).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.kind).toBe('negative-line');
    expect(result.failures[0]?.detail).toContain('MEMBER DISCOUNT');
    // The arithmetic is reported as it truly is, so a reviewer sees that
    // the total does agree and the filing is the only fault.
    expect(result.lineTotalCents).toBe(800);
    expect(result.totalCents).toBe(800);
  });

  it('accepts the same receipt with the discount in its proper place', () => {
    const proper = receipt({
      total: '$8.00',
      discounts: ['$2.00'],
      lines: [{ description: 'Timber Pine DAR 42x19', amount: '$10.00' }],
    });

    const result = gateExtraction(proper);

    expect(result.admissible).toBe(true);
    expect(result.failures).toEqual([]);
  });
});

describe('the two conventions for stated tax', () => {
  it('accepts a receipt whose prices already contain the tax', () => {
    // A real Kmart receipt: $30.00 of lines, $30.00 stated, and $2.73 of
    // GST — which is 30.00/11, the tax already inside the price. Adding it
    // would overstate the purchase by exactly the tax, and every Australian
    // receipt sent through the drop-zone failed this way.
    const inclusive = receipt({
      total: '$30.00',
      tax: '$2.73',
      lines: [
        { description: 'Towel Bath Ribbed', amount: '$12.00' },
        { description: 'Storage Basket', amount: '$18.00' },
      ],
    });

    const result = gateExtraction(inclusive);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(true);
  });

  it('accepts a receipt that adds the tax to its lines', () => {
    // The American convention, where the lines genuinely come to less than
    // the total. Both have to work without knowing where the shop is.
    const exclusive = receipt({
      total: '$32.73',
      tax: '$2.73',
      lines: [
        { description: 'Towel Bath Ribbed', amount: '$12.00' },
        { description: 'Storage Basket', amount: '$18.00' },
      ],
    });

    const result = gateExtraction(exclusive);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(false);
  });

  it('still refuses a receipt that reconciles under neither', () => {
    // Trying both conventions must not become two chances to pass.
    const wrong = receipt({
      total: '$40.00',
      tax: '$2.73',
      lines: [
        { description: 'Towel Bath Ribbed', amount: '$12.00' },
        { description: 'Storage Basket', amount: '$18.00' },
      ],
    });

    const result = gateExtraction(wrong);

    expect(result.admissible).toBe(false);
    expect(result.failures[0]?.kind).toBe('sum-mismatch');
  });

  it('accepts a delivered order whose prices already contain the tax', () => {
    // The Australian online order: $27.50 of goods, $9.95 delivery, $37.45
    // charged, and the GST stated as a fact about that total. Both
    // conventions have to keep working with a third term in the sum.
    const inclusive = receipt({ total: '$37.45', tax: '$3.40', shipping: '$9.95' });

    const result = gateExtraction(inclusive);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(true);
    expect(result.shippingCents).toBe(995);
  });

  it('accepts a delivered order that adds the tax to its lines', () => {
    const exclusive = receipt({ total: '$40.20', tax: '$2.75', shipping: '$9.95' });

    const result = gateExtraction(exclusive);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(false);
    expect(result.shippingCents).toBe(995);
  });

  it('still refuses a delivered order that reconciles under neither', () => {
    // A third term must not become a third chance to pass. $27.50 of lines
    // and $9.95 of delivery is $37.45 inclusive or $40.20 exclusive, and
    // neither is $50.00.
    const wrong = receipt({ total: '$50.00', tax: '$2.75', shipping: '$9.95' });

    const result = gateExtraction(wrong);

    expect(result.admissible).toBe(false);
    const mismatch = result.failures.find((f) => f.kind === 'sum-mismatch');
    expect(mismatch?.deltaCents).toBe(4020 - 5000);
  });
});

describe('delivery, in its own term', () => {
  it('reconciles an online order whose delivery is charged separately', () => {
    // The case the drop-zone could not previously reconcile without filing
    // the fee as a surcharge: an emailed order almost always carries one.
    const delivered = receipt({ total: '$37.45', shipping: '$9.95' });

    const result = gateExtraction(delivered);

    expect(result.admissible).toBe(true);
    expect(result.shippingCents).toBe(995);
    // The whole point of the split: the fee is no longer indistinguishable
    // from a card surcharge.
    expect(result.surchargeCents).toBe(0);
  });

  it('treats a receipt that states no delivery, and one stating zero, alike', () => {
    // Most receipts state none at all. `$0.00` is an amount and parses;
    // both mean nothing was charged for delivery.
    expect(gateExtraction(receipt()).shippingCents).toBe(0);
    expect(gateExtraction(receipt()).admissible).toBe(true);

    const stated = gateExtraction(receipt({ shipping: '$0.00' }));
    expect(stated.shippingCents).toBe(0);
    expect(stated.admissible).toBe(true);
  });

  it('reconciles delivery the merchant then waived', () => {
    // Charged and refunded on the same paper. The two terms cancel, which
    // they only do because they are separate terms with opposite signs.
    const waived = receipt({ total: '$27.50', shipping: '$9.95', discounts: ['$9.95'] });

    const result = gateExtraction(waived);

    expect(result.admissible).toBe(true);
    expect(result.shippingCents).toBe(995);
    expect(result.discountCents).toBe(995);
  });

  it('names delivery when the model wrote a word where money goes', () => {
    // The prompt says null unless an amount is stated, because "FREE" is
    // not money. If a model says it anyway the receipt must not be admitted
    // on a silently-zero shipping term — and the reviewer needs to be told
    // which field, not just that something failed.
    const free = receipt({ shipping: 'FREE' });

    const result = gateExtraction(free);

    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toEqual(['unreadable-line']);
    expect(result.failures[0]?.detail).toContain('shipping');
    expect(result.failures[0]?.detail).toContain('FREE');
  });

  it('names delivery when the model kept the label beside the money', () => {
    // The likelier misreading than "FREE": the receipt does state an amount,
    // and the model copies the line it was printed on. `parseAmountCents` is
    // anchored, so "Delivery $9.95" is not money — the term contributes
    // nothing and the sum it belonged to is short by exactly the fee. Two
    // failures, and neither would say "delivery" without the detail naming
    // the field. The prompt is what prevents this; the gate is what refuses
    // to admit it when the prompt does not take.
    const labelled = receipt({ total: '$37.45', shipping: 'Delivery $9.95' });

    const result = gateExtraction(labelled);

    expect(result.admissible).toBe(false);
    expect(result.shippingCents).toBe(0);
    expect(result.failures.map((f) => f.kind)).toEqual(['unreadable-line', 'sum-mismatch']);
    expect(result.failures[0]?.detail).toContain('shipping');
    expect(result.failures[0]?.detail).toContain('Delivery $9.95');

    const mismatch = result.failures.find((f) => f.kind === 'sum-mismatch');
    expect(mismatch?.kind === 'sum-mismatch' ? mismatch.deltaCents : null).toBe(-995);
  });

  it('adds a delivery charge stated as a negative, and refuses the result', () => {
    // Chosen, not inherited. `sumAmounts` normalises the sign, so a
    // "-$9.95" delivery adds 9.95 and the receipt lands in review rather
    // than quietly subtracting a charge the merchant added. Wrong in the
    // safe direction, which is the direction to be wrong in.
    const negative = gateExtraction(receipt({ shipping: '-$9.95' }));

    expect(negative.shippingCents).toBe(995);
    expect(negative.admissible).toBe(false);
  });

  it('refuses the same fee reported as both delivery and a surcharge', () => {
    // The one new way to break a receipt that reconciled before. While the
    // prompt change propagates a model may file the fee twice; the sum then
    // overstates by exactly the fee, which is what the delta must say.
    const doubled = receipt({ total: '$37.45', shipping: '$9.95', surcharges: ['$9.95'] });

    const result = gateExtraction(doubled);

    expect(result.admissible).toBe(false);
    const mismatch = result.failures.find((f) => f.kind === 'sum-mismatch');
    expect(mismatch?.deltaCents).toBe(995);
  });

  it('refuses the same fee reported as both delivery and a line item', () => {
    // Same double count, arriving the other way round: an emailed order
    // lists "Delivery $9.95" among the rows and states it in the totals.
    const doubled = receipt({
      total: '$37.45',
      shipping: '$9.95',
      lines: [
        { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
        { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
        { description: 'Delivery', amount: '$9.95' },
      ],
    });

    const result = gateExtraction(doubled);

    expect(result.admissible).toBe(false);
    const mismatch = result.failures.find((f) => f.kind === 'sum-mismatch');
    expect(mismatch?.deltaCents).toBe(995);
  });

  it('states the delivery figure in the mismatch, so the sentence explains its own number', () => {
    // A reviewer has to be able to reconstruct the arithmetic from the one
    // sentence. With a term in `net` that the sentence does not name, the
    // quoted total stops following from the quoted parts.
    const wrong = receipt({ total: '$99.99', shipping: '$9.95', surcharges: ['$0.12'] });

    const mismatch = gateExtraction(wrong).failures.find((f) => f.kind === 'sum-mismatch');

    expect(mismatch?.detail).toContain('2750c');
    expect(mismatch?.detail).toContain('12c surcharges');
    expect(mismatch?.detail).toContain('995c shipping');
    // 2750 − 0 + 12 + 995
    expect(mismatch?.detail).toContain('3757c');
    expect(mismatch?.detail).toContain('9999c');
  });
});

describe('moving money between surcharges and delivery', () => {
  // The safety property this change rests on. Both terms enter `net` with
  // the same sign, so the split cannot alter a verdict: no receipt that
  // reconciled before stops reconciling because of it, and none that failed
  // starts passing. Proven over every partition rather than asserted.
  const partitions: readonly { readonly name: string; readonly over: Partial<ExtractedReceipt> }[] =
    [
      { name: 'all of it a surcharge, as before', over: { surcharges: ['$9.95'], shipping: null } },
      { name: 'all of it delivery', over: { surcharges: [], shipping: '$9.95' } },
      { name: 'split across both', over: { surcharges: ['$5.00'], shipping: '$4.95' } },
      {
        name: 'split across both, the surcharge itemised',
        over: { surcharges: ['$3.00', '$2.00'], shipping: '$4.95' },
      },
    ];

  it('changes no verdict on a receipt that reconciles, under either convention', () => {
    for (const { name, over } of partitions) {
      const inclusive = gateExtraction(receipt({ total: '$37.45', tax: '$3.40', ...over }));
      expect(inclusive.admissible, name).toBe(true);
      expect(inclusive.taxIncluded, name).toBe(true);
      expect(inclusive.surchargeCents + inclusive.shippingCents, name).toBe(995);

      const exclusive = gateExtraction(receipt({ total: '$40.20', tax: '$2.75', ...over }));
      expect(exclusive.admissible, name).toBe(true);
      expect(exclusive.taxIncluded, name).toBe(false);
      expect(exclusive.surchargeCents + exclusive.shippingCents, name).toBe(995);
    }
  });

  it('changes no verdict, and no delta, on a receipt that does not', () => {
    for (const { name, over } of partitions) {
      const result = gateExtraction(receipt({ total: '$99.99', tax: '$2.75', ...over }));
      expect(result.admissible, name).toBe(false);
      const mismatch = result.failures.find((f) => f.kind === 'sum-mismatch');
      expect(mismatch?.deltaCents, name).toBe(3745 + 275 - 9999);
    }
  });
});

describe('an extraction error of exactly the stated tax', () => {
  // Trying both tax conventions is what lets a receipt say which one it was
  // printed under. It is also the one way a wrong reading reconciles: an
  // error of exactly the stated tax satisfies the convention the receipt was
  // NOT printed under, and the arithmetic cannot object because it lands on
  // zero. These pin both halves — the one that leaves evidence, and the one
  // that cannot.

  it('refuses a delivery fee double-filed as a surcharge, when the fee is the tax', () => {
    // The tax-exclusive receipt: $27.50 of goods, $9.95 delivery, $9.95 of
    // tax, $47.40 charged. A model that files the fee in both fields
    // overstates the added side by 995 — exactly what the exclusive
    // convention would have added — so the components land on the stated
    // total and the receipt reads as tax-inclusive. Admitted, before this,
    // with `taxCents` then written as zero: a purchase whose own components
    // do not sum to its own total.
    const doubled = receipt({
      total: '$47.40',
      tax: '$9.95',
      shipping: '$9.95',
      surcharges: ['$9.95'],
    });

    const result = gateExtraction(doubled);

    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toEqual(['ambiguous-tax']);
    expect(result.failures[0]?.detail).toContain('995c');
    // Not a mismatch, so there is no discrepancy to state — the contract
    // carries `deltaCents` only where one exists.
    expect(result.failures[0]).not.toHaveProperty('deltaCents');
    // And it must not be written under the convention it fell into.
    expect(result.taxIncluded).toBe(false);
  });

  it('refuses the same fee left among the lines as well, when the fee is the tax', () => {
    // The other channel into it, and the likelier one: an emailed order
    // prints "Delivery $9.95" as a row, so a model that also fills
    // `shipping` has stated the fee twice without repeating a field.
    const doubled = receipt({
      total: '$47.40',
      tax: '$9.95',
      shipping: '$9.95',
      lines: [
        { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
        { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
        { description: 'Delivery', amount: '$9.95' },
      ],
    });

    const result = gateExtraction(doubled);

    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toEqual(['ambiguous-tax']);
  });

  it('refuses one fee reported twice in surcharges, when the fee is the tax', () => {
    // Nothing about the check is a shipping check: it is the same amount
    // added twice, wherever the model put it.
    const doubled = receipt({ total: '$47.40', tax: '$9.95', surcharges: ['$9.95', '$9.95'] });

    const result = gateExtraction(doubled);

    expect(result.admissible).toBe(false);
    expect(result.failures.map((f) => f.kind)).toEqual(['ambiguous-tax']);
  });

  it('still admits the tax-inclusive receipt the check has to leave alone', () => {
    // The Australian delivered order, and the reason the check counts two
    // occurrences rather than one. Nothing here is stated twice.
    const inclusive = gateExtraction(receipt({ total: '$37.45', tax: '$3.40', shipping: '$9.95' }));

    expect(inclusive.admissible).toBe(true);
    expect(inclusive.taxIncluded).toBe(true);
  });

  it('still admits the tax-exclusive receipt the check has to leave alone', () => {
    const exclusive = gateExtraction(receipt({ total: '$40.20', tax: '$2.75', shipping: '$9.95' }));

    expect(exclusive.admissible).toBe(true);
    expect(exclusive.taxIncluded).toBe(false);
  });

  it('admits a tax-inclusive receipt carrying ONE component equal to its tax', () => {
    // The cost of counting one occurrence instead of two, refused. A
    // tax-inclusive receipt states a tax of total/11, and on a long shop
    // some line lands on it by coincidence — $110.00 of goods, $10.00 of
    // GST, and a $10.00 item. There is no second reading of these figures,
    // and pushing every such receipt into review would spend the reviewer's
    // attention on arithmetic that is not in doubt.
    const coincidence = receipt({
      total: '$110.00',
      tax: '$10.00',
      lines: [
        { description: 'Timber Pine DAR 42x19', amount: '$100.00' },
        { description: 'Screws Bugle 8g 65mm', amount: '$10.00' },
      ],
    });

    const result = gateExtraction(coincidence);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(true);
  });

  it('admits a repeated amount that is not the stated tax', () => {
    // Two identical items on one receipt is ordinary, and says nothing
    // about the tax convention. Only a repeat that equals the tax can flip
    // the reading, so only that is refused.
    const twins = receipt({
      total: '$19.90',
      tax: '$1.81',
      lines: [
        { description: 'Coffee Flat White', amount: '$9.95' },
        { description: 'Coffee Flat White', amount: '$9.95' },
      ],
    });

    const result = gateExtraction(twins);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(true);
  });

  it('admits a repeated amount when the receipt states no tax at all', () => {
    // With no tax there is no other convention to fall into: both branches
    // are the same sum. A receipt that genuinely charged $9.95 twice must
    // not be refused for a flip that cannot happen.
    const doubled = receipt({
      total: '$47.40',
      tax: null,
      shipping: '$9.95',
      surcharges: ['$9.95'],
    });

    const result = gateExtraction(doubled);

    expect(result.admissible).toBe(true);
    expect(result.shippingCents).toBe(995);
    expect(result.surchargeCents).toBe(995);
  });

  it('leaves a tax-exclusive receipt alone even when it repeats its tax figure', () => {
    // The check hangs off the inclusive branch alone, and deliberately: a
    // spurious added component inflates the added side, which can only
    // reach the total under the inclusive reading. Here $27.50 of goods,
    // $9.95 delivery, a $9.95 surcharge and $9.95 of tax reconcile under
    // exactly one convention, so nothing is in doubt.
    const exclusive = receipt({
      total: '$57.35',
      tax: '$9.95',
      shipping: '$9.95',
      surcharges: ['$9.95'],
    });

    const result = gateExtraction(exclusive);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(false);
  });

  it('cannot catch the mirror case, where the model dropped what it should have added', () => {
    // Stated so the limit is explicit, and pinned so a change that claims to
    // close it has to confront this test. The Australian receipt is $27.50
    // of goods, $9.95 delivery and $37.45 charged, with $9.95 stated as tax.
    // A model that drops the delivery row understates the added side by
    // 9.95, which is exactly what the exclusive convention adds — so it
    // reconciles as an American receipt instead.
    //
    // There is nothing here to detect. The evidence is a figure that is not
    // present, and an extraction missing a component is indistinguishable
    // from a receipt that never charged one: these exact figures are also a
    // correct reading of a tax-exclusive receipt for $27.50 of goods.
    const dropped = receipt({ total: '$37.45', tax: '$9.95' });

    const result = gateExtraction(dropped);

    expect(result.admissible).toBe(true);
    expect(result.taxIncluded).toBe(false);
  });
});

describe('a fee the merchant added', () => {
  it('reconciles a real ALDI receipt with its card surcharge', () => {
    // The receipt: $24.05 of groceries, a 0.50% credit surcharge of 12c,
    // and a $24.17 total. Without somewhere to put the surcharge this is
    // out by 12c forever, and card surcharges are on most Australian card
    // receipts.
    const aldi = receipt({
      total: '$24.17',
      tax: null,
      surcharges: ['0.12'],
      lines: [
        { description: 'BeefChuckCass CW', amount: '17.56' },
        { description: 'ChsBlockColby500g', amount: '6.49' },
      ],
    });

    const result = gateExtraction(aldi);

    expect(result.admissible).toBe(true);
    expect(result.surchargeCents).toBe(12);
  });

  it('does not let a surcharge excuse a genuine mismatch', () => {
    const wrong = receipt({
      total: '$30.00',
      tax: null,
      surcharges: ['0.12'],
      lines: [{ description: 'BeefChuckCass CW', amount: '17.56' }],
    });

    expect(gateExtraction(wrong).admissible).toBe(false);
  });
});
