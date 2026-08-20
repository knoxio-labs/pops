import Papa from 'papaparse';

import type { BankDialect } from './bank-dialect';
import type { ParsedCsvFile } from './csv-merge';

/**
 * Reading an uploaded CSV into the wizard's row shape, for both header layouts.
 *
 * Every file is read positionally and then keyed by column name, so merging,
 * auto-detection, mapping and preview all receive the same
 * `Record<string, string>` whether or not the export named its columns, and
 * none of them needs to know which it was.
 */

export interface ParseResult {
  ok: boolean;
  error?: string;
  parsed?: ParsedCsvFile;
}

const DATE_CELL = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/;
const AMOUNT_CELL = /^[-+(]?\d+(\.\d+)?\)?$/;

function isDateLike(cell: string): boolean {
  return DATE_CELL.test(cell.trim());
}

function isAmountLike(cell: string): boolean {
  const cleaned = cell.trim().replaceAll(/[$,\s]/g, '');
  return cleaned.length > 0 && AMOUNT_CELL.test(cleaned);
}

function looksLikeTransaction(row: readonly string[]): boolean {
  return row.some((cell) => isDateLike(cell) || isAmountLike(cell));
}

/**
 * Whether row 1 names the columns or is already a transaction.
 *
 * The file answers this more reliably than the bank picker does, and the cost
 * of believing the picker is silent: reading a headerless export as headed
 * consumes a real charge as the column names and drops it from the import with
 * nothing to show for it, while reading a headed export as headerless imports
 * the column names as a transaction. A row carrying a date or a signed amount
 * is data; only a row carrying neither falls back to what the dialect declares.
 */
export function firstRowIsHeader(rows: readonly string[][], dialect: BankDialect): boolean {
  const first = rows[0];
  if (!first) return dialect.hasHeader;
  return !looksLikeTransaction(first);
}

/**
 * Name every column of the widest row, falling back to a positional name where
 * the source has none.
 *
 * Rows longer than the declared columns keep their surplus cells rather than
 * being dropped, since a silently truncated row would import as a valid
 * transaction with data missing. Repeated names are suffixed so two columns
 * never collapse into one key.
 */
function nameColumns(names: readonly string[], width: number): string[] {
  const occurrences = new Map<string, number>();
  return Array.from({ length: width }, (_unused, index) => {
    const base = names[index]?.trim() || `Column ${index + 1}`;
    const seen = occurrences.get(base) ?? 0;
    occurrences.set(base, seen + 1);
    return seen === 0 ? base : `${base}_${seen}`;
  });
}

function stripByteOrderMark(row: readonly string[]): string[] {
  const [first, ...rest] = row;
  return first === undefined ? [] : [first.replace(/^\uFEFF/, ''), ...rest];
}

function parseCsvFile(file: File, dialect: BankDialect): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          resolve({
            ok: false,
            error: `${file.name}: CSV parsing error: ${results.errors[0]?.message ?? 'Unknown error'}`,
          });
          return;
        }
        const lines = results.data.map(stripByteOrderMark);
        const [firstLine] = lines;
        if (!firstLine) {
          resolve({ ok: false, error: `${file.name}: CSV file is empty` });
          return;
        }
        const hasHeaderRow = firstRowIsHeader(lines, dialect);
        const dataRows = hasHeaderRow ? lines.slice(1) : lines;
        if (dataRows.length === 0) {
          resolve({ ok: false, error: `${file.name}: CSV file is empty` });
          return;
        }
        const names = hasHeaderRow ? firstLine : (dialect.columns ?? []);
        const width = Math.max(names.length, ...dataRows.map((row) => row.length));
        const headers = nameColumns(names, width);
        resolve({
          ok: true,
          parsed: {
            fileName: file.name,
            headers,
            rows: dataRows.map((row) =>
              Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
            ),
          },
        });
      },
      error: (error) =>
        resolve({ ok: false, error: `${file.name}: Failed to parse CSV: ${error.message}` }),
    });
  });
}

export async function parseAllFiles(
  files: File[],
  dialect: BankDialect
): Promise<{ error?: string; parsed: ParsedCsvFile[] }> {
  const parsed: ParsedCsvFile[] = [];
  for (const file of files) {
    const result = await parseCsvFile(file, dialect);
    if (!result.ok || !result.parsed) return { error: result.error ?? 'Unknown error', parsed: [] };
    parsed.push(result.parsed);
  }
  return { parsed };
}
