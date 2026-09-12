/**
 * A receipt captured abroad, against the card charge that settled it.
 *
 * The shape every test here is built on: the receipt is priced in the
 * merchant's currency and the card row is in AUD, so the only two numbers
 * that can be compared are the receipt total and the foreign amount the
 * issuer printed. Everything else — the converted total, the conversion fee
 * — is arithmetic nobody recorded a rate for.
 *
 * Each match has its near-miss beside it. A suite that only proved BRL
 * matches BRL would be equally green over a ladder that had stopped
 * comparing currencies at all, which is the state this code was in.
 */
import { describe, expect, it } from 'vitest';

import { charge, run, txn } from './solver-fixtures.js';

/** A BRL receipt: R$ 128,90, captured in São Paulo. */
const BRL_TOTAL = 12_890;

/**
 * The card row that settled it. AUD 34.71 — which is the converted total
 * WITH ANZ's 3% fee folded in, the shape that makes the settlement figure
 * unusable as a comparison and the foreign one exact.
 */
function brlCharge(overrides = {}) {
  return charge({ amountCents: BRL_TOTAL, currency: 'BRL', source: 'receipt', ...overrides });
}

function brlSettlement(overrides = {}) {
  return txn({
    description: 'PADARIA SAO JOAO SAO PAULO BR',
    amountCents: 3471,
    settlementCurrency: 'AUD',
    foreignAmountMinor: BRL_TOTAL,
    foreignCurrency: 'BRL',
    ...overrides,
  });
}

describe('a foreign receipt and its card charge', () => {
  it('matches on the foreign amount the issuer recorded', () => {
    const { links, review } = run({ charges: [brlCharge()], transactions: [brlSettlement()] });

    expect(review).toEqual([]);
    expect(links).toHaveLength(1);
    expect(links[0]?.linkType).toBe('exact');
    expect(links[0]?.transactionUri).toBe('pops://finance/transaction/t1');
  });

  it('records the link in the charge currency, not the settlement one', () => {
    // `purchase_charge_links.amount_cents` is defined in the charge's
    // currency. Writing AUD 34.71 there would be a number in the wrong unit
    // that nothing downstream could detect.
    const { links } = run({ charges: [brlCharge()], transactions: [brlSettlement()] });

    expect(links[0]?.amountCents).toBe(BRL_TOTAL);
  });

  it('is unaffected by the conversion fee, however the issuer bills it', () => {
    // Same receipt, an issuer that bills the fee as its own AUD row. The fee
    // row carries no foreign amount, so it is not a candidate for a BRL
    // charge at all — it cannot be consumed as a part-payment of one.
    const fee = txn({
      uri: 'pops://finance/transaction/fee',
      description: 'INTNL TRANSACTION FEE',
      amountCents: 101,
      settlementCurrency: 'AUD',
      foreignAmountMinor: null,
      foreignCurrency: null,
    });
    const { links } = run({
      charges: [brlCharge()],
      transactions: [brlSettlement({ amountCents: 3370 }), fee],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.transactionUri).toBe('pops://finance/transaction/t1');
  });

  it('matches a refund, whose foreign amount is stored as a magnitude', () => {
    // Every importer records `foreignAmountMinor` unsigned; the direction of
    // the money is on the settlement row. A refund read as positive here
    // would fail the sign guard and never match.
    const { links } = run({
      charges: [brlCharge({ amountCents: -BRL_TOTAL, role: 'refund' })],
      transactions: [brlSettlement({ amountCents: -3471 })],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.amountCents).toBe(-BRL_TOTAL);
  });
});

describe('what a cross-currency comparison refuses', () => {
  it('does not match an AUD row whose cents happen to equal the BRL total', () => {
    const lookalike = txn({
      description: 'PADARIA SAO JOAO SAO PAULO BR',
      amountCents: BRL_TOTAL,
      settlementCurrency: 'AUD',
      foreignAmountMinor: null,
      foreignCurrency: null,
    });

    const { links, review } = run({ charges: [brlCharge()], transactions: [lookalike] });

    expect(links).toEqual([]);
    expect(review).toHaveLength(1);
    // Not "ambiguous": there was never a candidate. The pair was refused
    // before any stage formed an opinion about it.
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('refuses a transaction whose foreign columns were never captured', () => {
    // The pre-POPS-2604 rows, and every importer that still states nothing.
    // Null means nobody looked, which is not evidence of a domestic charge.
    const uncaptured = brlSettlement({ foreignAmountMinor: null, foreignCurrency: null });

    const { links, review } = run({ charges: [brlCharge()], transactions: [uncaptured] });

    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('refuses a foreign amount in a different currency', () => {
    const wrongCurrency = brlSettlement({ foreignCurrency: 'USD' });

    const { links, review } = run({ charges: [brlCharge()], transactions: [wrongCurrency] });

    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('no-candidate');
  });

  it('does not part-pay a foreign charge from the settlement figure', () => {
    // AUD 34.71 is smaller than R$ 128,90 as an integer, so a partial stage
    // reading the settlement amount would call this a part-payment and
    // invent a residual of R$ 94,19.
    const uncaptured = brlSettlement({ foreignAmountMinor: null, foreignCurrency: null });

    const { links } = run({ charges: [brlCharge()], transactions: [uncaptured] });

    expect(links).toEqual([]);
  });
});

describe('currencies whose minor unit is not a hundredth', () => {
  /**
   * ¥1,200. This pillar's receipt parser scales every printed price by 100
   * whatever the currency, so the charge is 120000; finance stores the yen's
   * own 1200 minor units. Comparing them without rescaling is a hundredfold
   * error in whichever direction it is made.
   */
  const jpyCharge = charge({ amountCents: 120_000, currency: 'JPY', source: 'receipt' });

  it('matches a JPY receipt against the yen minor units finance stores', () => {
    const settled = txn({
      description: 'IZAKAYA TOKYO JP',
      amountCents: 1301,
      settlementCurrency: 'AUD',
      foreignAmountMinor: 1200,
      foreignCurrency: 'JPY',
    });

    const { links } = run({ charges: [jpyCharge], transactions: [settled] });

    expect(links).toHaveLength(1);
    expect(links[0]?.amountCents).toBe(120_000);
  });

  it('does not match a JPY row read as though yen had cents', () => {
    // 120000 minor units of JPY is ¥120,000 — a hundred times the receipt.
    // A comparison that skipped the rescale would accept this one and
    // reject the real charge above.
    const hundredfold = txn({
      description: 'IZAKAYA TOKYO JP',
      amountCents: 1301,
      settlementCurrency: 'AUD',
      foreignAmountMinor: 120_000,
      foreignCurrency: 'JPY',
    });

    const { links, review } = run({ charges: [jpyCharge], transactions: [hundredfold] });

    expect(links).toEqual([]);
    // A candidate in the right currency, at the wrong amount — which is a
    // question for a human, not a refusal.
    expect(review[0]?.reason).toBe('ambiguous');
  });

  it('refuses a three-decimal currency rather than rounding one away', () => {
    // 1.234 KWD is 1234 minor units, and the receipt parser already rounded
    // the printed price to two decimals. The digit the comparison would need
    // is missing from the stored charge, so there is no honest equality to
    // find — only one that could be manufactured by dividing.
    const kwd = charge({ amountCents: 123, currency: 'KWD', source: 'receipt' });
    const settled = txn({
      description: 'SOUQ KUWAIT KW',
      amountCents: 612,
      settlementCurrency: 'AUD',
      foreignAmountMinor: 1234,
      foreignCurrency: 'KWD',
    });

    const { links, review } = run({ charges: [kwd], transactions: [settled] });

    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('no-candidate');
  });
});

describe('the same-currency path is untouched', () => {
  it('still demands the exact cent', () => {
    const { links, review } = run({
      charges: [charge({ amountCents: 4128 })],
      transactions: [txn({ amountCents: 4129 })],
    });

    expect(links).toEqual([]);
    expect(review[0]?.reason).toBe('ambiguous');
  });

  it('ignores a foreign amount when the charge is in the settlement currency', () => {
    // An AUD-priced order settled on a card that also recorded a foreign
    // leg. The AUD figure is the comparable one; the foreign amount is not
    // a second chance to match.
    const { links } = run({
      charges: [charge({ amountCents: 4128 })],
      transactions: [txn({ amountCents: 4128, foreignAmountMinor: 9999, foreignCurrency: 'USD' })],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.amountCents).toBe(4128);
  });
});

describe('combining charges across a currency boundary', () => {
  it('combines two charges in one currency against the foreign amount', () => {
    const { links } = run({
      charges: [
        brlCharge({ id: 'chg-a', position: 0, amountCents: 8000 }),
        brlCharge({ id: 'chg-b', position: 1, amountCents: 4890 }),
      ],
      transactions: [brlSettlement()],
    });

    expect(links.map((link) => link.linkType)).toEqual(['combined', 'combined']);
    expect(links.map((link) => link.amountCents).toSorted((a, b) => a - b)).toEqual([4890, 8000]);
  });

  it('never adds a BRL charge to an AUD one to reach a total', () => {
    // R$ 35,00 and AUD 15.00 both read as 5000 against this transaction —
    // R$ 50,00 abroad, AUD 50.00 settled — but only because 3500 + 1500 is
    // an addition across two different units. Each charge alone is the only
    // member of its currency's group, so neither combination exists.
    const { links } = run({
      charges: [
        brlCharge({ id: 'chg-a', position: 0, amountCents: 3500 }),
        charge({ id: 'chg-b', position: 1, amountCents: 1500, currency: 'AUD' }),
      ],
      transactions: [brlSettlement({ amountCents: 5000, foreignAmountMinor: 5000 })],
    });

    expect(links.filter((link) => link.linkType === 'combined')).toEqual([]);
  });
});
