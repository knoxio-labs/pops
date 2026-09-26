/**
 * Bulk entry's rules, row by row, and the partial accept the API applies
 * (owner decision 3): every valid row is created, every invalid row stays
 * in the grid with its reasons. A row with nothing typed is neither: it is
 * ignored. Each message names the cell and says what would make it valid.
 */
import type { BulkColumn, BulkDraft } from './paste-parser';

/** One problem with one cell. */
export interface BulkIssue {
  row: number;
  column: BulkColumn;
  message: string;
}

/** A published type bulk entry can file a row under. */
export interface BulkType {
  id: string;
  label: string;
  containment: boolean;
}

/** What validation checks rows against. */
export interface BulkContext {
  types: readonly BulkType[];
  /** Existing codes, uppercased, with the item that holds each. */
  codes: ReadonlyMap<string, string>;
  /** Whether a typed place or container name resolves to exactly one target. */
  resolvesWhere: (text: string) => boolean;
}

/** Whether a row has nothing typed in it. */
export function isBlank(draft: BulkDraft): boolean {
  return Object.values(draft).every((cell) => cell.trim() === '');
}

function typeOf(draft: BulkDraft, context: BulkContext): BulkType | null | undefined {
  const label = draft.type.trim().toLowerCase();
  if (label === '') return null;
  return context.types.find((type) => type.label.toLowerCase() === label);
}

function quantityIssue(draft: BulkDraft, type: BulkType | null | undefined): string | null {
  const text = draft.quantity.trim();
  if (text === '') return null;
  if (!/^\d+$/u.test(text) || Number(text) < 1) return 'Quantity is a whole number, 1 or more.';
  if (type?.containment === true && Number(text) > 1)
    return `A ${type.label} is a container, so its quantity is 1.`;
  return null;
}

function codeIssue(
  draft: BulkDraft,
  index: number,
  rows: readonly BulkDraft[],
  context: BulkContext
): string | null {
  const code = draft.code.trim().toUpperCase();
  if (code === '') return null;
  const holder = context.codes.get(code);
  if (holder !== undefined) return `Code ${code} is already on ${holder}.`;
  const earlier = rows.findIndex(
    (other, at) => at !== index && other.code.trim().toUpperCase() === code
  );
  return earlier === -1 ? null : `Code ${code} is also on row ${String(earlier + 1)}.`;
}

/** The issues on one row. */
export function rowIssues(
  rows: readonly BulkDraft[],
  index: number,
  context: BulkContext
): BulkIssue[] {
  const draft = rows[index];
  if (draft === undefined || isBlank(draft)) return [];
  const issues: BulkIssue[] = [];
  const add = (column: BulkColumn, message: string | null) => {
    if (message !== null) issues.push({ row: index, column, message });
  };
  const type = typeOf(draft, context);
  add('name', draft.name.trim() === '' ? 'Name is required.' : null);
  add(
    'type',
    type === undefined
      ? `No type is called ${draft.type.trim()}. Leave it blank to file the item untyped.`
      : null
  );
  add('quantity', quantityIssue(draft, type));
  add('code', codeIssue(draft, index, rows, context));
  const where = draft.where.trim();
  add(
    'where',
    where !== '' && !context.resolvesWhere(where)
      ? `No place or container is called ${where}.`
      : null
  );
  return issues;
}

/** Every issue in the grid, row order. */
export function validateRows(rows: readonly BulkDraft[], context: BulkContext): BulkIssue[] {
  return rows.flatMap((_, index) => rowIssues(rows, index, context));
}

/** The outcome of submitting the grid. */
export interface BulkSettlement {
  created: BulkDraft[];
  /** What stays in the grid: the invalid rows, in their order. */
  remaining: BulkDraft[];
  remainingIssues: BulkIssue[];
}

/**
 * Partial accept: valid rows are created, invalid rows remain, blank rows
 * are dropped. Remaining rows are checked again against the codes the
 * created rows now hold, so every message refers to the grid as it is
 * after the submit.
 */
export function settle(rows: readonly BulkDraft[], context: BulkContext): BulkSettlement {
  const failing = new Set(validateRows(rows, context).map((issue) => issue.row));
  const created = rows.filter((row, index) => !isBlank(row) && !failing.has(index));
  const remaining = rows.filter((_, index) => failing.has(index));
  const codes = new Map(context.codes);
  for (const row of created) {
    if (row.code.trim() !== '') codes.set(row.code.trim().toUpperCase(), row.name.trim());
  }
  return { created, remaining, remainingIssues: validateRows(remaining, { ...context, codes }) };
}
