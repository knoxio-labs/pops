/**
 * The whole PDF path, end to end: real PDF bytes through real pdf.js, the real
 * line reconstruction and the real contract row parser.
 *
 * The statement fixtures place columns on a grid chosen HERE, not observed on
 * an ANZ statement. So a passing assertion about a recovered suburb says the
 * chain is internally consistent — extraction, reconstruction and the parser's
 * fixed-offset split all agree — and says nothing about whether ANZ prints its
 * detail column where these fixtures put it. That question needs a real
 * statement and is tracked on its own.
 */
import { describe, expect, it } from 'vitest';

import {
  describeImportRefusal,
  describePdfFailure,
  hasFindings,
  importAnzPdfStatements,
  readAnzPdfUpload,
  uploadRoute,
} from './anz-pdf-import';
import {
  imageOnlyPdf,
  monospacedTextPdf,
  passwordProtectedPdf,
} from './synthetic-pdf.test-helpers';

import type { AccountCoverage } from './anz-pdf-import';
import type { PlacedText } from './synthetic-pdf.test-helpers';

const UNCHECKED: AccountCoverage = { known: false };

/** Columns this fixture prints a statement row in. Invented; see the file header. */
const PROCESSED = 0;
const TRANSACTED = 12;
const CARD = 24;
const MERCHANT = 30;
const DETAIL = 56;
const AMOUNT = 76;
const BALANCE = 88;

interface Row {
  processed: string;
  transacted: string;
  merchant: string;
  detail?: string;
  amount: string;
  credit?: boolean;
  balance: string;
}

function statementRow(row: Row, line: number): PlacedText[] {
  const placed: PlacedText[] = [
    { row: line, column: PROCESSED, text: row.processed },
    { row: line, column: TRANSACTED, text: row.transacted },
    { row: line, column: CARD, text: '4321' },
    { row: line, column: MERCHANT, text: row.merchant },
    { row: line, column: AMOUNT, text: row.credit ? `${row.amount} CR` : row.amount },
    { row: line, column: BALANCE, text: row.balance },
  ];
  if (row.detail) placed.push({ row: line, column: DETAIL, text: row.detail });
  return placed;
}

function statementPdf(rows: readonly Row[], extraLines: readonly PlacedText[] = []): Uint8Array {
  return monospacedTextPdf([
    [...extraLines, ...rows.flatMap((row, i) => statementRow(row, i + 2))],
  ]);
}

function pdfFile(bytes: Uint8Array, name = 'statement.pdf'): File {
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}

const GROCER: Row = {
  processed: '01/03/2024',
  transacted: '28/02/2024',
  merchant: 'ALDI STORES - MARRICKV',
  detail: 'MARRICKVILLE',
  amount: '42.10',
  balance: '1,234.56',
};

const REFUND: Row = {
  processed: '04/03/2024',
  transacted: '02/03/2024',
  merchant: 'BIG W ONLINE',
  detail: 'BIGW.COM.AU',
  amount: '19.00',
  credit: true,
  balance: '1,215.56',
};

async function importOne(bytes: Uint8Array, coverage: AccountCoverage = UNCHECKED) {
  const result = await importAnzPdfStatements([pdfFile(bytes)], coverage, 'acc-test');
  if (!result.ok) throw new Error(`expected a statement, got ${result.error.failure.outcome}`);
  return result.statement;
}

describe('importAnzPdfStatements', () => {
  it('reads a printed statement row into a transaction', async () => {
    const { plan } = await importOne(statementPdf([GROCER]));
    expect(plan.importable).toHaveLength(1);
    expect(plan.importable[0]).toMatchObject({
      date: '2024-02-28',
      description: 'ALDI STORES - MARRICKV',
      location: 'Marrickville',
      amount: -42.1,
      dialectAccountLabel: 'ANZ Credit Card',
    });
  });

  it('gives every transaction the dedup checksum the CSV path would hash', async () => {
    const { plan } = await importOne(statementPdf([GROCER]));
    // 64 lower-case hex characters is what crypto-js SHA-256 produces, and is
    // what `column-map/validation.ts` stores for a CSV row.
    expect(plan.importable[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads a CR suffix as money in', async () => {
    const { plan } = await importOne(statementPdf([REFUND]));
    expect(plan.importable[0]?.amount).toBe(19);
  });

  it('merges the statements of several files in the order given', async () => {
    const result = await importAnzPdfStatements(
      [pdfFile(statementPdf([GROCER]), 'jan.pdf'), pdfFile(statementPdf([REFUND]), 'feb.pdf')],
      UNCHECKED,
      'acc-test'
    );
    if (!result.ok) throw new Error('expected both files to read');
    expect(result.statement.plan.importable.map((t) => t.description)).toEqual([
      'ALDI STORES - MARRICKV',
      'BIG W ONLINE',
    ]);
    expect(result.statement.pageCount).toBe(2);
  });

  it('reports a line that opens like a row and does not parse, rather than skipping it', async () => {
    // A row printed without the trailing running balance: the shape a changed
    // statement layout takes. It must not read as a statement with one charge.
    const withoutBalance: PlacedText[] = [
      { row: 6, column: PROCESSED, text: '07/03/2024' },
      { row: 6, column: TRANSACTED, text: '05/03/2024' },
      { row: 6, column: CARD, text: '4321' },
      { row: 6, column: MERCHANT, text: 'COFFEE SUPPLY CO' },
      { row: 6, column: AMOUNT, text: '8.50' },
    ];
    const { plan, unrecognisedRows } = await importOne(statementPdf([GROCER], withoutBalance));
    expect(plan.importable).toHaveLength(1);
    expect(unrecognisedRows).toHaveLength(1);
    expect(unrecognisedRows[0]).toContain('COFFEE SUPPLY CO');
  });

  it('refuses a readable PDF that is not a statement', async () => {
    const notAStatement = monospacedTextPdf([
      [
        { row: 0, column: 0, text: 'Your annual summary' },
        { row: 2, column: 0, text: 'Total interest charged this year: 0.00' },
      ],
    ]);
    const { plan } = await importOne(notAStatement);
    expect(plan.importable).toHaveLength(0);
    expect(plan.refusal).toBe('no-transactions-found');
  });

  it('says the overlap check did not run when nothing can say what the account covers', async () => {
    const statement = await importOne(statementPdf([GROCER]));
    expect(statement.coverageChecked).toBe(false);
    expect(statement.plan.withheld).toEqual([]);
  });

  it('counts the check as run, withholding nothing, for an account known to be empty', async () => {
    const statement = await importOne(statementPdf([GROCER, REFUND]), { known: true });
    expect(statement.coverageChecked).toBe(true);
    expect(statement.plan.withheld).toEqual([]);
    expect(statement.plan.importable).toHaveLength(2);
  });

  it('withholds a row the account already covers, and itemises it', async () => {
    const statement = await importOne(statementPdf([GROCER, REFUND]), {
      known: true,
      interval: { from: '2024-02-01', to: '2024-02-29' },
    });
    expect(statement.coverageChecked).toBe(true);
    expect(statement.plan.importable.map((t) => t.date)).toEqual(['2024-03-02']);
    expect(statement.plan.withheld).toHaveLength(1);
    expect(statement.plan.withheld[0]).toMatchObject({
      reason: 'already-covered',
      transaction: { date: '2024-02-28' },
    });
  });

  it('stops the batch at the first file it cannot read', async () => {
    const result = await importAnzPdfStatements(
      [pdfFile(passwordProtectedPdf(), 'locked.pdf'), pdfFile(statementPdf([GROCER]), 'ok.pdf')],
      UNCHECKED,
      'acc-test'
    );
    expect(result).toEqual({
      ok: false,
      error: { fileName: 'locked.pdf', failure: { outcome: 'password-protected' } },
    });
  });
});

describe('readAnzPdfUpload', () => {
  it('asks for a look before importing when the statement has findings', async () => {
    const decision = await readAnzPdfUpload(
      [pdfFile(statementPdf([GROCER]))],
      UNCHECKED,
      'acc-test'
    );
    expect(decision.kind).toBe('review');
  });

  it('imports straight through when there is nothing to report', async () => {
    const decision = await readAnzPdfUpload(
      [pdfFile(statementPdf([GROCER]))],
      {
        known: true,
        interval: { from: '2020-01-01', to: '2020-12-31' },
      },
      'acc-test'
    );
    expect(decision.kind).toBe('import');
  });

  it('turns a refusal into a message rather than an empty import', async () => {
    const blank = monospacedTextPdf([[{ row: 0, column: 0, text: 'nothing to see' }]]);
    const decision = await readAnzPdfUpload([pdfFile(blank)], UNCHECKED, 'acc-test');
    expect(decision).toEqual({
      kind: 'error',
      message: describeImportRefusal('no-transactions-found'),
    });
  });

  it('turns an unreadable file into a message naming the file', async () => {
    const decision = await readAnzPdfUpload(
      [pdfFile(imageOnlyPdf(), 'scan.pdf')],
      UNCHECKED,
      'acc-test'
    );
    expect(decision.kind).toBe('error');
    if (decision.kind !== 'error') return;
    expect(decision.message).toContain('scan.pdf');
    expect(decision.message).toContain('no text');
  });
});

describe('describePdfFailure', () => {
  it('tells someone with a locked statement what to do about it', () => {
    expect(
      describePdfFailure({ fileName: 'jan.pdf', failure: { outcome: 'password-protected' } })
    ).toContain('unlocked copy');
  });

  it('tells someone with a scan that the download is the fix', () => {
    expect(
      describePdfFailure({
        fileName: 'scan.pdf',
        failure: { outcome: 'no-text-layer', pageCount: 3 },
      })
    ).toContain('Internet Banking');
  });

  it('keeps the underlying reason a file was not a PDF', () => {
    expect(
      describePdfFailure({
        fileName: 'x.pdf',
        failure: { outcome: 'not-a-pdf', detail: 'no header' },
      })
    ).toContain('no header');
  });

  it('reports a failure it does not model instead of dropping it', () => {
    expect(
      describePdfFailure({ fileName: 'x.pdf', failure: { outcome: 'unreadable', detail: 'boom' } })
    ).toContain('boom');
  });
});

describe('uploadRoute', () => {
  const csv = new File(['a'], 'export.csv', { type: 'text/csv' });
  const pdf = new File(['a'], 'statement.pdf', { type: 'application/pdf' });

  it.each([
    ['empty', []],
    ['csv', [csv]],
    ['pdf', [pdf]],
    ['mixed', [csv, pdf]],
  ])('routes a selection to %s', (expected, files) => {
    expect(uploadRoute(files as File[])).toBe(expected);
  });

  it('routes an uppercase extension the same way', () => {
    expect(uploadRoute([new File(['a'], 'STATEMENT.PDF')])).toBe('pdf');
  });
});

describe('hasFindings', () => {
  const clean = {
    plan: { importable: [], withheld: [] },
    unrecognisedRows: [],
    coverageChecked: true,
    pageCount: 1,
  };

  it('is quiet when the overlap check ran and nothing was withheld or unread', () => {
    expect(hasFindings(clean)).toBe(false);
  });

  it('speaks up when the overlap check did not run', () => {
    expect(hasFindings({ ...clean, coverageChecked: false })).toBe(true);
  });

  it('speaks up for an unread line', () => {
    expect(hasFindings({ ...clean, unrecognisedRows: ['01/01/2024 01/01/2024 ???'] })).toBe(true);
  });
});
