import { toCsv } from '../../foundation/list-page/inventory-csv.js';
import {
  BLANK_DRAFT,
  BULK_COLUMNS,
  columnForHeader,
} from '../../foundation/list-page/paste-parser.js';

import type { BulkColumn, BulkDraft } from '../../foundation/list-page/paste-parser.js';

/** The maximum number of parsed data rows accepted by the importer. */
export const IMPORT_MAX_ROWS = 5000;

/** Where one file column goes: an item field, or nowhere. */
export type ColumnTarget = BulkColumn | 'skip';

/** One file column's mapping, in file order. */
export interface ColumnMapping {
  header: string;
  target: ColumnTarget;
}

/** A mapping problem that stops the preview. */
export interface MappingProblem {
  target: BulkColumn;
  message: string;
}

const FIELD_NAMES: Readonly<Record<BulkColumn, string>> = {
  name: 'Name',
  type: 'Type',
  quantity: 'Quantity',
  code: 'Code',
  where: 'Where',
  note: 'Note',
};

/** The item-field label shown for a mapping target. */
export function fieldName(target: ColumnTarget): string {
  return target === 'skip' ? 'Not imported' : FIELD_NAMES[target];
}

/** Guesses each recognised field once, with the first matching header winning. */
export function guessMapping(headers: readonly string[]): ColumnMapping[] {
  const taken = new Set<BulkColumn>();
  return headers.map((header) => {
    const column = columnForHeader(header);
    if (column === null || taken.has(column)) return { header, target: 'skip' };
    taken.add(column);
    return { header, target: column };
  });
}

/** Returns the mapping problems that must be fixed before rows can be checked. */
export function mappingProblems(mapping: readonly ColumnMapping[]): MappingProblem[] {
  const problems: MappingProblem[] = [];
  if (!mapping.some((column) => column.target === 'name')) {
    problems.push({ target: 'name', message: 'Choose the column that holds each item’s name.' });
  }
  for (const target of BULK_COLUMNS) {
    const feeding = mapping
      .filter((column) => column.target === target)
      .map((column) => column.header);
    if (feeding.length > 1) {
      problems.push({
        target,
        message: `${feeding.join(' and ')} both feed ${FIELD_NAMES[target]}. Keep one.`,
      });
    }
  }
  return problems;
}

/** Applies a column mapping to parsed rows, trimming cells and filling missing cells. */
export function applyMapping(
  rows: readonly (readonly string[])[],
  mapping: readonly ColumnMapping[]
): BulkDraft[] {
  return rows.map((cells) => {
    const draft: Record<BulkColumn, string> = { ...BLANK_DRAFT };
    mapping.forEach((column, index) => {
      if (column.target !== 'skip') draft[column.target] = (cells[index] ?? '').trim();
    });
    return draft;
  });
}

interface CsvState {
  records: string[][];
  cells: string[];
  cell: string;
  quoted: boolean;
  hasContent: boolean;
}

function resetRecord(state: CsvState): void {
  state.cells = [];
  state.cell = '';
  state.quoted = false;
  state.hasContent = false;
}

function finishRecord(state: CsvState): void {
  if (!state.hasContent && state.cells.length === 0 && state.cell.length === 0) {
    resetRecord(state);
    return;
  }
  state.cells.push(state.cell);
  state.records.push(state.cells);
  resetRecord(state);
}

function readQuotedCharacter(source: string, index: number, state: CsvState): number {
  const character = source[index];
  if (character !== '"') {
    state.cell += character ?? '';
    state.hasContent = true;
    return index;
  }
  if (source[index + 1] === '"') {
    state.cell += '"';
    state.hasContent = true;
    return index + 1;
  }
  state.quoted = false;
  return index;
}

function readUnquotedCharacter(source: string, index: number, state: CsvState): number {
  const character = source[index];
  switch (character) {
    case '"':
      state.quoted = true;
      state.hasContent = true;
      return index;
    case ',':
      state.cells.push(state.cell);
      state.cell = '';
      state.hasContent = true;
      return index;
    case '\r':
      finishRecord(state);
      return source[index + 1] === '\n' ? index + 1 : index;
    case '\n':
      finishRecord(state);
      return index;
    default:
      state.cell += character ?? '';
      state.hasContent ||= (character ?? '').trim() !== '';
      return index;
  }
}

function hasRecord(state: CsvState): boolean {
  return state.hasContent || state.cells.length > 0 || state.cell.length > 0;
}

/**
 * Reads an RFC 4180 CSV file, preserving quoted commas and line breaks while
 * dropping empty physical lines outside quoted cells.
 */
export function readCsv(text: string): { headers: string[]; rows: string[][] } {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const state: CsvState = {
    records: [],
    cells: [],
    cell: '',
    quoted: false,
    hasContent: false,
  };

  for (let index = 0; index < source.length; index += 1) {
    index = state.quoted
      ? readQuotedCharacter(source, index, state)
      : readUnquotedCharacter(source, index, state);
  }
  if (hasRecord(state)) finishRecord(state);

  const [headers = [], ...rows] = state.records;
  return { headers, rows };
}

/** Returns the upload alert sentence for a refused file, or null when accepted. */
export function fileRefusal(fileName: string, parsed: { rows: readonly unknown[] }): string | null {
  if (!fileName.toLowerCase().endsWith('.csv')) {
    return `${fileName} was not read. Only CSV files can be imported. Save the sheet as CSV (comma separated) and choose it again.`;
  }
  if (parsed.rows.length === 0) {
    return `${fileName} was not read. It has no rows under the header.`;
  }
  if (parsed.rows.length > IMPORT_MAX_ROWS) {
    return `${fileName} was not read. It has more than 5,000 rows. Split it and import each part.`;
  }
  return null;
}

/** Writes the original skipped rows with their server problems in a Problem column. */
export function skippedCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  problems: readonly string[]
): string {
  return toCsv([
    [...headers, 'Problem'],
    ...rows.map((row, index) => [...row, problems[index] ?? '']),
  ]);
}
