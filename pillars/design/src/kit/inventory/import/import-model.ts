/**
 * CSV import: which item field each file column feeds, what is wrong with a
 * mapping before anything is read, and the rows the mapping produces. The
 * rows then go through bulk entry's rules, so a file and a paste are held
 * to the same checks and the same partial accept.
 */
import { BLANK_DRAFT, BULK_COLUMNS, columnForHeader } from '../bulk-entry/paste-parser';

import type { BulkColumn, BulkDraft } from '../bulk-entry/paste-parser';

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

/** The field a mapping target is called on screen. */
export function fieldName(target: ColumnTarget): string {
  return target === 'skip' ? 'Not imported' : FIELD_NAMES[target];
}

/** A first guess from the headers; a field is guessed once, the first header wins. */
export function guessMapping(headers: readonly string[]): ColumnMapping[] {
  const taken = new Set<BulkColumn>();
  return headers.map((header) => {
    const column = columnForHeader(header);
    if (column === null || taken.has(column)) return { header, target: 'skip' };
    taken.add(column);
    return { header, target: column };
  });
}

/** What stops this mapping: no Name, or two columns feeding one field. */
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

/** The drafts a mapping reads from the file's rows. */
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
