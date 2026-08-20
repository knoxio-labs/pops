import Papa from 'papaparse';

import type { BankDialect } from './bank-dialect';
import type { ParsedCsvFile } from './csv-merge';

/**
 * Reading an uploaded CSV into the wizard's row shape, for both header layouts.
 *
 * A headerless export is read positionally and keyed by the dialect's synthetic
 * column names, so merging, auto-detection, mapping and preview all receive the
 * same `Record<string, string>` a headed file produces and none of them needs
 * to know the file arrived without a header row.
 */

export interface ParseResult {
  ok: boolean;
  error?: string;
  parsed?: ParsedCsvFile;
}

/**
 * Key a headerless file's rows by the dialect's synthetic column names, so
 * every later step — merging, auto-detection, mapping, preview — sees the same
 * `Record<string, string>` shape a headed file produces.
 *
 * Rows longer than the declared columns keep their surplus cells under a
 * positional name rather than being dropped, since a silently truncated row
 * would import as a valid transaction with data missing.
 */
function keyByColumns(
  rows: string[][],
  columns: readonly string[]
): { headers: string[]; rows: Record<string, string>[] } {
  const width = Math.max(columns.length, ...rows.map((row) => row.length));
  const headers = Array.from(
    { length: width },
    (_unused, index) => columns[index] ?? `Column ${index + 1}`
  );
  return {
    headers,
    rows: rows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
    ),
  };
}

function parseHeaderless(file: File, columns: readonly string[]): Promise<ParseResult> {
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
        if (results.data.length === 0) {
          resolve({ ok: false, error: `${file.name}: CSV file is empty` });
          return;
        }
        const { headers, rows } = keyByColumns(results.data, columns);
        resolve({ ok: true, parsed: { fileName: file.name, headers, rows } });
      },
      error: (error) =>
        resolve({ ok: false, error: `${file.name}: Failed to parse CSV: ${error.message}` }),
    });
  });
}

function parseHeaded(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          resolve({
            ok: false,
            error: `${file.name}: CSV parsing error: ${results.errors[0]?.message ?? 'Unknown error'}`,
          });
          return;
        }
        if (results.data.length === 0) {
          resolve({ ok: false, error: `${file.name}: CSV file is empty` });
          return;
        }
        const headers = results.meta.fields ?? [];
        if (headers.length === 0) {
          resolve({ ok: false, error: `${file.name}: CSV file has no headers` });
          return;
        }
        resolve({ ok: true, parsed: { fileName: file.name, headers, rows: results.data } });
      },
      error: (error) =>
        resolve({ ok: false, error: `${file.name}: Failed to parse CSV: ${error.message}` }),
    });
  });
}

function parseCsvFile(file: File, dialect: BankDialect): Promise<ParseResult> {
  return dialect.hasHeader || !dialect.columns
    ? parseHeaded(file)
    : parseHeaderless(file, dialect.columns);
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
