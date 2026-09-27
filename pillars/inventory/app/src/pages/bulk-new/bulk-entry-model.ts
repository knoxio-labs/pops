import { BLANK_DRAFT, type BulkDraft } from '../../foundation/list-page/paste-parser.js';

import type { InventoryApiError } from '../../inventory-api-helpers.js';
import type { BatchRowOutcome } from '../../inventory-web/useBatchCreate.js';
import type { BulkCounts, BulkIssue, BulkRowState, BulkRowStatus } from './use-bulk-entry.js';

const SPARE_ROWS = 3;

/** True when every cell in a draft is empty after trimming. */
export function isBlankDraft(draft: BulkDraft): boolean {
  return Object.values(draft).every((value) => value.trim() === '');
}

function blankRow(): BulkRowState {
  return { draft: BLANK_DRAFT, status: 'blank', issues: [] };
}

/** Creates the initial grid with its three spare rows. */
export function initialRows(): BulkRowState[] {
  return Array.from({ length: SPARE_ROWS }, blankRow);
}

/** Creates a row state, collapsing whitespace-only drafts to a blank row. */
export function rowState(
  draft: BulkDraft,
  status: Exclude<BulkRowStatus, 'blank'> = 'unchecked',
  issues: readonly BulkIssue[] = []
): BulkRowState {
  if (isBlankDraft(draft)) return blankRow();
  return { draft, status, issues };
}

/** Finds the last row that contains any non-whitespace draft value. */
export function lastNonBlankIndex(rows: readonly BulkRowState[]): number {
  let last = -1;
  rows.forEach((row, index) => {
    if (!isBlankDraft(row.draft)) last = index;
  });
  return last;
}

/** Trims the grid to its last typed row while retaining three spare rows. */
export function normalizeRows(rows: readonly BulkRowState[]): BulkRowState[] {
  const last = lastNonBlankIndex(rows);
  const length = Math.max(SPARE_ROWS, last + 1 + SPARE_ROWS);
  return Array.from({ length }, (_, index) => {
    const row = rows[index];
    return row === undefined
      ? blankRow()
      : rowState(row.draft, row.status === 'blank' ? 'unchecked' : row.status, row.issues);
  });
}

/** Keeps draft text while clearing server status and issues for every row. */
export function resetRows(rows: readonly BulkRowState[]): BulkRowState[] {
  return normalizeRows(rows.map((row) => rowState(row.draft)));
}

/** Returns whether any typed row has a server-reported validation issue. */
export function hasRefusedRows(rows: readonly BulkRowState[]): boolean {
  return rows.some((row) => row.status === 'refused');
}

/** Selects the non-submit phase represented by the current row statuses. */
export function workingPhase(rows: readonly BulkRowState[]): 'editing' | 'has-errors' {
  return hasRefusedRows(rows) ? 'has-errors' : 'editing';
}

/** Counts typed, ready, refused, and recently created rows for the page. */
export function countRows(rows: readonly BulkRowState[], created: number): BulkCounts {
  let rowCount = 0;
  let ready = 0;
  let refused = 0;
  rows.forEach((row) => {
    if (isBlankDraft(row.draft)) return;
    rowCount += 1;
    if (row.status === 'ready') ready += 1;
    if (row.status === 'refused') refused += 1;
  });
  return { rows: rowCount, ready, refused, created };
}

/** Applies a row-ordered server validation result without changing draft text. */
export function applyValidation(
  rows: readonly BulkRowState[],
  outcomes: readonly BatchRowOutcome[]
): BulkRowState[] {
  const byRow = new Map<number, BatchRowOutcome>();
  outcomes.forEach((outcome) => byRow.set(outcome.row, outcome));
  return normalizeRows(
    rows.map((row, index) => {
      const outcome = byRow.get(index);
      if (outcome === undefined) return rowState(row.draft);
      if (outcome.status === 'invalid') return rowState(row.draft, 'refused', outcome.issues);
      if (outcome.status === 'valid') return rowState(row.draft, 'ready');
      return rowState(row.draft);
    })
  );
}

/** The page state produced after a partial create run. */
export interface CommitResult {
  rows: BulkRowState[];
  createdIds: string[];
  error: InventoryApiError | null;
}

/** Removes created rows and preserves invalid or unsent rows after a commit. */
export function applyCommit(
  rows: readonly BulkRowState[],
  outcomes: readonly BatchRowOutcome[]
): CommitResult {
  const byRow = new Map<number, BatchRowOutcome>();
  outcomes.forEach((outcome) => byRow.set(outcome.row, outcome));
  const created = new Set<number>();
  const createdIds: string[] = [];
  let error: InventoryApiError | null = null;

  outcomes.forEach((outcome) => {
    if (outcome.status === 'created') {
      created.add(outcome.row);
      createdIds.push(outcome.itemId);
    } else if (outcome.status === 'not-sent' && error === null) {
      error = outcome.error;
    }
  });

  const nextRows = rows.flatMap((row, index) => {
    if (created.has(index)) return [];
    const outcome = byRow.get(index);
    if (outcome === undefined || outcome.status === 'not-sent') return [row];
    if (outcome.status === 'invalid') return [rowState(row.draft, 'refused', outcome.issues)];
    if (outcome.status === 'valid') return [rowState(row.draft, 'ready')];
    return [rowState(row.draft)];
  });

  return { rows: normalizeRows(nextRows), createdIds, error };
}
