/**
 * Tests for the ANZ PDF statement parser and its cross-source import plan.
 *
 * The statement text here is synthetic. It reproduces the layouts that make the
 * naive implementation wrong — a merchant carrying its own double space, a
 * foreign-currency trailer, and two same-day same-amount charges at different
 * branches of one merchant — rather than being lifted from a real statement.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseAnzDescription } from '../anz-description.js';
import {
  parseAnzPdfStatementText,
  planAnzPdfImport,
  type AnzPdfStatementOptions,
} from '../anz-pdf-statement.js';
import { buildImportDedupKey } from '../import-dedup.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const OPTIONS: AnzPdfStatementOptions = {
  dialectAccountLabel: 'ANZ Credit Card',
  accountId: 'acc-anz-credit-card',
  hashDedupKey: sha256,
};

/** Merchant padded to the 25-character column, so the detail field starts at 26. */
const KENSINGTON_DESCRIPTION = 'SQ *RIVERSIDE MARKETS     KENSINGTON';
const SPRINGFIELD_DESCRIPTION = 'SQ *RIVERSIDE MARKETS     SPRINGFIELD';
const FOREIGN_DESCRIPTION = 'GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD';

const STATEMENT = [
  'ANZ Frequent Flyer Black',
  'Date        Transaction Date  Card  Details                     Amount    Balance',
  `24/04/2025 22/04/2025 4821 ${KENSINGTON_DESCRIPTION} 20.40 1,020.40`,
  `24/04/2025 22/04/2025 4821 ${SPRINGFIELD_DESCRIPTION} 20.40 1,040.80`,
  `05/05/2025 02/05/2025 4821 ${FOREIGN_DESCRIPTION} 100.00 1,140.80`,
  '20/05/2025 18/05/2025 4821 PAYMENT RECEIVED THANK YOU 500.00 CR 640.80',
  '                           100.00 USD',
  '                           OVERSEAS TRANSACTION FEE',
  'Closing balance 640.80',
].join('\n');

function parse(text = STATEMENT) {
  return parseAnzPdfStatementText(text, OPTIONS);
}

describe('parseAnzPdfStatementText', () => {
  it('finds every transaction row and nothing else', () => {
    const { transactions, unrecognisedRows } = parse();
    expect(transactions.map((t) => t.date)).toEqual([
      '2025-04-22',
      '2025-04-22',
      '2025-05-02',
      '2025-05-18',
    ]);
    expect(unrecognisedRows).toEqual([]);
  });

  it('signs a purchase negative and a CR row positive', () => {
    const amounts = parse().transactions.map((t) => t.amount);
    expect(amounts).toEqual([-20.4, -20.4, -100, 500]);
  });

  describe('closing-balance capture (POPS-2882)', () => {
    it("captures every row's running balance in cents, unsigned", () => {
      const balances = parse().transactions.map((t) => t.balanceCents);
      expect(balances).toEqual([102_040, 104_080, 114_080, 64_080]);
    });

    it('leaves balanceMarker unset for a row with no CR/DR suffix on the balance', () => {
      expect(parse().transactions[0]?.balanceMarker).toBeUndefined();
    });

    it('reports the last row in the file as the closing balance candidate', () => {
      const last = parse().transactions.at(-1);
      expect(last).toMatchObject({ date: '2025-05-18', balanceCents: 64_080 });
    });

    it('captures the balance-in-credit marker, unsigned', () => {
      const overpaid = parse(
        '20/05/2025 18/05/2025 4821 PAYMENT RECEIVED THANK YOU 500.00 CR 640.80 CR'
      ).transactions[0];
      expect(overpaid).toMatchObject({ balanceCents: 64_080, balanceMarker: 'CR' });
    });
  });

  describe('reuse of the shared description parser', () => {
    it('derives exactly what the CSV path derives from the same raw description', () => {
      const foreign = parse().transactions[2];
      const shared = parseAnzDescription(FOREIGN_DESCRIPTION);
      expect(foreign).toMatchObject({
        description: shared.description,
        location: shared.location,
        country: shared.country,
        foreignAmountMinor: shared.foreignCharge?.amountMinor,
        foreignCurrency: shared.foreignCharge?.currency,
        fxFeeCents: shared.foreignCharge?.feeCents,
      });
    });

    it('keeps a merchant name that contains its own double space', () => {
      // Collapsing whitespace before the fixed-width split — what the historic
      // PDF transformer did — truncates this to the whole line as one string.
      expect(parse().transactions[2]?.description).toBe('GITHUB INC.');
    });

    it('recovers the foreign charge that only the padded layout exposes', () => {
      expect(parse().transactions[2]).toMatchObject({
        location: 'Github.com',
        country: 'US',
        foreignAmountMinor: 10_000,
        foreignCurrency: 'USD',
        fxFeeCents: 503,
      });
    });

    it('declares the descriptor as the capture source on every row, foreign or not', () => {
      // A PDF row has no country column either, so without this marker a
      // domestic one is indistinguishable from an uncaptured one (POPS-2647).
      const [domestic] = parse().transactions;

      expect(domestic?.foreignCurrency).toBeUndefined();
      expect(domestic?.fxCaptureSource).toBe('anz-descriptor');
      expect(parse().transactions[2]?.fxCaptureSource).toBe('anz-descriptor');
    });

    it('leaves a bank narrative that runs through the boundary intact', () => {
      expect(parse().transactions[3]).toMatchObject({
        description: 'PAYMENT RECEIVED THANK YOU',
        location: undefined,
      });
    });
  });

  describe('the two-branches-one-merchant pair', () => {
    it('keeps both charges, with the suburb only in the stored location', () => {
      const [kensington, springfield] = parse().transactions;
      expect(kensington?.description).toBe('SQ *RIVERSIDE MARKETS');
      expect(springfield?.description).toBe('SQ *RIVERSIDE MARKETS');
      expect(kensington?.location).toBe('Kensington');
      expect(springfield?.location).toBe('Springfield');
    });

    it('gives them different checksums, so neither is dropped as a duplicate', () => {
      const [kensington, springfield] = parse().transactions;
      expect(kensington?.checksum).not.toBe(springfield?.checksum);
    });

    it('keys dedup on the description as printed, not the parsed one', () => {
      const kensington = parse().transactions[0];
      expect(kensington?.checksum).toBe(
        sha256(
          buildImportDedupKey({
            accountId: 'acc-anz-credit-card',
            date: '2025-04-22',
            amount: -20.4,
            description: KENSINGTON_DESCRIPTION,
          })
        )
      );
    });
  });

  describe('rows this parser does not model', () => {
    it('reports a row that opens like a transaction and does not parse', () => {
      const { transactions, unrecognisedRows } = parse(
        '01/06/2025 30/05/2025 4821 TRUNCATED ROW WITH NO BALANCE 12.34'
      );
      expect(transactions).toEqual([]);
      expect(unrecognisedRows).toEqual([
        '01/06/2025 30/05/2025 4821 TRUNCATED ROW WITH NO BALANCE 12.34',
      ]);
    });

    it('reports a row whose printed date is not a real day', () => {
      const { transactions, unrecognisedRows } = parse(
        '32/13/2025 32/13/2025 4821 IMPOSSIBLE DATE ROW 10.00 20.00'
      );
      expect(transactions).toEqual([]);
      expect(unrecognisedRows).toHaveLength(1);
    });

    it('skips supplementary lines without reporting them', () => {
      expect(parse('                           100.00 USD')).toEqual({
        transactions: [],
        unrecognisedRows: [],
      });
    });
  });
});

describe('planAnzPdfImport', () => {
  const transactions = parse().transactions;

  it('offers every row when the account has no existing coverage', () => {
    expect(planAnzPdfImport(transactions, null)).toEqual({
      importable: transactions,
      withheld: [],
    });
  });

  it('withholds only the rows inside the covered interval, itemised', () => {
    const plan = planAnzPdfImport(transactions, { from: '2025-05-01', to: '2025-06-30' });
    expect(plan.importable.map((t) => t.date)).toEqual(['2025-04-22', '2025-04-22']);
    expect(plan.withheld).toEqual([
      { transaction: transactions[2], reason: 'already-covered' },
      { transaction: transactions[3], reason: 'already-covered' },
    ]);
    expect(plan.refusal).toBeUndefined();
  });

  it('treats the covered interval as inclusive at both ends', () => {
    const plan = planAnzPdfImport(transactions, { from: '2025-04-22', to: '2025-05-18' });
    expect(plan.importable).toEqual([]);
    expect(plan.withheld).toHaveLength(4);
  });

  it('refuses a statement the account already covers end to end', () => {
    const plan = planAnzPdfImport(transactions, { from: '2025-01-01', to: '2025-12-31' });
    expect(plan.refusal).toBe('entirely-already-covered');
  });

  it('refuses an empty statement rather than reporting a clean import', () => {
    const plan = planAnzPdfImport(parse('Closing balance 640.80').transactions, null);
    expect(plan).toEqual({ importable: [], withheld: [], refusal: 'no-transactions-found' });
  });
});
