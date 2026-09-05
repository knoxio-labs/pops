/**
 * The ANZ credit-card PDF path: uploaded files in, an import plan out.
 *
 * This is the wiring between {@link extractPdfText}, which turns PDF bytes into
 * statement text, and the shared contract's row parser, which turns that text
 * into transactions. It owns three things the contract deliberately does not:
 * reading the browser's `File`, hashing the dedup key, and deciding what a
 * failure reads as.
 *
 * ## Nothing is retained
 *
 * Each file is read into memory, parsed, and released. No copy of the statement
 * is written anywhere — not to the server, not to the wizard's IndexedDB
 * persistence, which stores only parsed transactions and never the source
 * bytes. Re-importing after a browser restart means picking the file again.
 * That is the intended trade: a bank statement is the one document here worth
 * keeping no durable copy of.
 *
 * ## A file that fails stops the batch
 *
 * The CSV path abandons a whole selection on the first file it cannot read, and
 * this matches it. Merging what parsed with a silent hole where a statement
 * failed is the failure mode both paths exist to avoid.
 */
import crypto from 'crypto-js';

import { parseAnzPdfStatementText, planAnzPdfImport } from '@pops/finance';

import { extractPdfText, type PdfExtraction } from './extract-pdf-text';

import type { AnzPdfImportPlan, DateInterval } from '@pops/finance';

/** Every way reading a file can end other than with text. */
export type PdfFailure = Exclude<PdfExtraction, { outcome: 'text' }>;

/**
 * What an account's existing transactions already span, or the fact that
 * nothing was able to say.
 *
 * Modelled as a state rather than an optional interval on purpose. An absent
 * interval and an interval covering nothing produce the same empty `withheld`
 * list, and reading that list as "checked, no overlap" when the check never ran
 * is the specific mistake this shape prevents. Finance exposes no query for an
 * account's date span yet, so today's answer is always `known: false`.
 */
/**
 * What the account already holds. `known` without an `interval` is an empty
 * account — checked, nothing to withhold — which is a different answer from
 * `known: false`, where the check could not run at all.
 */
export type AccountCoverage = { known: true; interval?: DateInterval } | { known: false };

export interface AnzPdfStatementImport {
  plan: AnzPdfImportPlan;
  /** Lines that opened like a statement row and did not parse, across every file. */
  unrecognisedRows: string[];
  /** Whether the overlap check in {@link AnzPdfImportPlan.withheld} actually ran. */
  coverageChecked: boolean;
  pageCount: number;
}

export interface AnzPdfImportFailure {
  fileName: string;
  failure: PdfFailure;
}

export type AnzPdfImportResult =
  | { ok: true; statement: AnzPdfStatementImport }
  | { ok: false; error: AnzPdfImportFailure };

/**
 * SHA-256 of the dedup key, the same digest over the same key the CSV path
 * hashes in `column-map/validation.ts`. The contract parser takes this injected
 * so it stays free of a crypto dependency.
 */
function hashDedupKey(key: string): string {
  return crypto.SHA256(key).toString();
}

/** Whether a selection should be read as PDF statements rather than CSV exports. */
export function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Which reader a selection calls for.
 *
 * `mixed` is called out rather than resolved by majority or by the first file:
 * a CSV export and a PDF statement of the same period are the one case where
 * the cross-source duplicate this path withholds is guaranteed, and reading the
 * batch as either kind would silently ignore half of it.
 */
export type UploadRoute = 'empty' | 'csv' | 'pdf' | 'mixed';

export function uploadRoute(files: readonly File[]): UploadRoute {
  if (files.length === 0) return 'empty';
  const pdfs = files.filter(isPdfFile).length;
  if (pdfs === 0) return 'csv';
  return pdfs === files.length ? 'pdf' : 'mixed';
}

/** Why the whole statement yielded nothing, in terms of what to do next. */
export function describeImportRefusal(refusal: NonNullable<AnzPdfImportPlan['refusal']>): string {
  switch (refusal) {
    case 'no-transactions-found':
      return 'No transaction rows were found in this PDF. It opened and it has text on it, but nothing on it is laid out like an ANZ credit-card statement — check that this is a statement rather than a letter, a summary or another account.';
    case 'entirely-already-covered':
      return 'Every transaction on this statement falls inside the period this account already holds, so there is nothing left to import.';
  }
}

/** Whether reading the statement turned up anything worth reading before importing. */
export function hasFindings(statement: AnzPdfStatementImport): boolean {
  return (
    statement.unrecognisedRows.length > 0 ||
    statement.plan.withheld.length > 0 ||
    !statement.coverageChecked
  );
}

/**
 * What the wizard should do with a PDF selection.
 *
 * `review` is the case that keeps a changed statement layout from passing as a
 * shorter statement: anything the reader could not account for is put in front
 * of the person before a single row is imported, and importing is a second,
 * separate decision.
 */
export type PdfUploadDecision =
  | { kind: 'error'; message: string }
  | { kind: 'review'; statement: AnzPdfStatementImport }
  | { kind: 'import'; statement: AnzPdfStatementImport };

export async function readAnzPdfUpload(
  files: readonly File[],
  coverage: AccountCoverage,
  accountId: string
): Promise<PdfUploadDecision> {
  const result = await importAnzPdfStatements(files, coverage, accountId);
  if (!result.ok) return { kind: 'error', message: describePdfFailure(result.error) };
  const { statement } = result;
  if (statement.plan.refusal) {
    return { kind: 'error', message: describeImportRefusal(statement.plan.refusal) };
  }
  return { kind: hasFindings(statement) ? 'review' : 'import', statement };
}

/** What to tell someone whose upload could not be read, and what to do about it. */
export function describePdfFailure({ fileName, failure }: AnzPdfImportFailure): string {
  switch (failure.outcome) {
    case 'password-protected':
      return `${fileName}: this PDF is password-protected. Open it, save an unlocked copy, and upload that.`;
    case 'no-text-layer':
      return `${fileName}: this PDF has no text on it — ${failure.pageCount === 1 ? 'its page is' : 'its pages are'} images, which is what a scan or a photographed statement looks like. Download the statement from ANZ Internet Banking instead of scanning it.`;
    case 'not-a-pdf':
      return `${fileName}: this file is not a readable PDF (${failure.detail}).`;
    case 'unreadable':
      return `${fileName}: this PDF could not be read (${failure.detail}).`;
  }
}

const ACCOUNT = 'ANZ Credit Card';

/**
 * Read every selected PDF as an ANZ credit-card statement and plan the import.
 *
 * Files are processed in the order given, and the first that cannot be read
 * ends the run — see the note on batches above.
 */
export async function importAnzPdfStatements(
  files: readonly File[],
  coverage: AccountCoverage,
  accountId: string
): Promise<AnzPdfImportResult> {
  const transactions = [];
  const unrecognisedRows: string[] = [];
  let pageCount = 0;

  for (const file of files) {
    const extraction = await extractPdfText(await file.arrayBuffer());
    if (extraction.outcome !== 'text') {
      return { ok: false, error: { fileName: file.name, failure: extraction } };
    }
    pageCount += extraction.pageCount;
    const statement = parseAnzPdfStatementText(extraction.text, {
      dialectAccountLabel: ACCOUNT,
      accountId,
      hashDedupKey,
    });
    transactions.push(...statement.transactions);
    unrecognisedRows.push(...statement.unrecognisedRows);
  }

  return {
    ok: true,
    statement: {
      plan: planAnzPdfImport(transactions, coverage.known ? coverage.interval : undefined),
      unrecognisedRows,
      coverageChecked: coverage.known,
      pageCount,
    },
  };
}
