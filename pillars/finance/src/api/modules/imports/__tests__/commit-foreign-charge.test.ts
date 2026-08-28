/**
 * End-to-end cover for the foreign-charge columns, from a real statement row
 * of each source through to the stored row (POPS-2604).
 *
 * The three columns and `country` were NULL on every row on the live database
 * while `parseAnzDescription` — well covered at its own tier — was filling them
 * correctly. Every tier had a test; the hops between them did not, so the values
 * were dropped in transit without a single assertion failing. These tests take
 * the statement line as the input and the stored row as the output, so no hop
 * between them can quietly drop a field again.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { parseAmexRow } from '../../../../contract/amex-row.js';
import { parseAnzDescription } from '../../../../contract/anz-description.js';
import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactions } from '../../../../db/schema.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { commitImport } from '../commit.js';

import type { CommitPayload } from '../types.js';

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

/**
 * The commit payload the import wizard builds for one statement line, with the
 * bank-specific parse applied exactly as `bank-dialect` applies it for ANZ.
 */
function payloadForStatementLine(line: string, amount: number): CommitPayload {
  const { description, location, country, foreignCharge } = parseAnzDescription(line);
  return {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: [
      {
        date: '2026-07-01',
        description,
        amount,
        account: 'ANZ Credit Card',
        location,
        country,
        foreignAmountMinor: foreignCharge?.amountMinor,
        foreignCurrency: foreignCharge?.currency,
        fxFeeCents: foreignCharge?.feeCents,
        rawRow: JSON.stringify({ line }),
        checksum: `chk-${line.length}-${amount}`,
        transactionType: 'purchase',
        entityId: undefined,
        entityName: undefined,
      },
    ],
  };
}

async function commitLine(line: string, amount: number) {
  const { db } = freshMigratedFinanceDb();
  const result = await commitImport(db, noContacts(), payloadForStatementLine(line, amount));
  expect(result.failedDetails).toEqual([]);
  expect(result.transactionsImported).toBe(1);
  const [row] = db
    .select()
    .from(transactions)
    .where(eq(transactions.account, 'ANZ Credit Card'))
    .all();
  return row;
}

describe('foreign-charge capture, statement line to stored row', () => {
  it('stores all three columns and the country for a two-decimal foreign charge', async () => {
    const row = await commitLine(
      'GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD',
      -155.4
    );

    expect(row).toMatchObject({
      description: 'GITHUB INC.',
      location: 'Github.com',
      country: 'US',
      foreignAmountMinor: 10_000,
      foreignCurrency: 'USD',
      fxFeeCents: 503,
    });
  });

  it('stores a zero-decimal charge in whole units, not scaled by a hundred', async () => {
    // ANZ writes JPY thousands with a SPACE. Read as a two-decimal currency this
    // would store 110000 minor units; JPY has no minor unit, so it is 1100.
    const row = await commitLine('AOMORI GROCER             AOMORI  1 100  JPY 0.40 AUD', -11.5);

    expect(row).toMatchObject({
      country: 'JP',
      foreignAmountMinor: 1100,
      foreignCurrency: 'JPY',
      fxFeeCents: 40,
    });
  });

  it('leaves all three columns NULL for a domestic charge rather than writing zeros', async () => {
    const row = await commitLine('ALDI STORES - MARRICKV    MARRICKVILLE', -42.5);

    expect(row).toMatchObject({ location: 'Marrickville' });
    expect(row?.country).toBeNull();
    expect(row?.foreignAmountMinor).toBeNull();
    expect(row?.foreignCurrency).toBeNull();
    expect(row?.fxFeeCents).toBeNull();
  });
});

/** The commit payload the wizard builds for one Amex export row. */
function payloadForAmexRow(row: Record<string, string>): CommitPayload {
  const { country, foreignCharge } = parseAmexRow(row);
  return {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: [
      {
        date: '2026-07-25',
        description: row.Description ?? '',
        amount: -Number(row.Amount ?? 0),
        account: 'Amex',
        country,
        foreignAmountMinor: foreignCharge?.amountMinor,
        foreignCurrency: foreignCharge?.currency,
        fxFeeCents: foreignCharge?.feeCents,
        rawRow: JSON.stringify(row),
        checksum: `chk-amex-${row.Description ?? ''}`,
        transactionType: 'purchase',
      },
    ],
  };
}

async function commitAmexRow(row: Record<string, string>) {
  const { db } = freshMigratedFinanceDb();
  const result = await commitImport(db, noContacts(), payloadForAmexRow(row));
  expect(result.failedDetails).toEqual([]);
  expect(result.transactionsImported).toBe(1);
  return db.select().from(transactions).where(eq(transactions.account, 'Amex')).all()[0];
}

describe('foreign-charge capture from an Amex export row', () => {
  it('stores all three columns, with the merchant country rather than the currency country', async () => {
    // The real export's one foreign charge: a Singapore merchant billing USD.
    // ANZ would infer `US` from the currency; Amex states where the merchant is.
    const row = await commitAmexRow({
      Description: 'NANONOBLE PTE. LTD.     SINGAPORE',
      Amount: '8.11',
      'Foreign Spend Amount': '5.50 USD',
      Commission: '0.27',
      Country: 'SINGAPORE',
    });

    expect(row).toMatchObject({
      country: 'SG',
      foreignAmountMinor: 550,
      foreignCurrency: 'USD',
      fxFeeCents: 27,
      amountCents: -811,
    });
  });

  it('stores the country of a domestic row, so NULL still means uncaptured', async () => {
    const row = await commitAmexRow({
      Description: 'ALDI 1234',
      Amount: '42.50',
      'Foreign Spend Amount': '',
      Commission: '',
      Country: 'AUSTRALIA',
    });

    expect(row?.country).toBe('AU');
    expect(row?.foreignAmountMinor).toBeNull();
    expect(row?.foreignCurrency).toBeNull();
    expect(row?.fxFeeCents).toBeNull();
  });

  it("leaves the short export's row entirely uncaptured, country included", async () => {
    const row = await commitAmexRow({ Description: 'ALDI 1234', Amount: '42.50' });

    expect(row?.country).toBeNull();
    expect(row?.foreignCurrency).toBeNull();
  });
});
