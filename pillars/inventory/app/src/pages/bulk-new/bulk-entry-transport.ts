import { InventoryApiError } from '../../inventory-api-helpers.js';
import { lastNonBlankIndex } from './bulk-entry-model.js';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { BulkDraft } from '../../foundation/list-page/paste-parser.js';
import type { PlacementTarget } from '../../foundation/model/model.js';
import type { BatchDestination, BatchRow } from '../../inventory-web/useBatchCreate.js';
import type { BulkRowState } from './use-bulk-entry.js';

/** Maps a placement model target to the batch endpoint's destination shape. */
export function toBatchDestination(target: PlacementTarget): BatchDestination {
  if (target.kind === 'in-hand') return { kind: 'hand' };
  if (target.kind === 'location') {
    return { kind: 'location', locationId: target.locationId };
  }
  return { kind: 'container', itemId: target.containerId };
}

function typeLabel(types: readonly FilterOption[], key: string | null): string {
  return types.find((option) => option.value === key)?.label ?? '';
}

function batchRow(
  draft: BulkDraft,
  types: readonly FilterOption[],
  defaultTypeKey: string | null
): BatchRow {
  return {
    name: draft.name,
    type: draft.type.trim() === '' ? typeLabel(types, defaultTypeKey) : draft.type,
    quantity: draft.quantity,
    code: draft.code,
    where: draft.where,
    note: draft.note,
  };
}

/** Builds the row payload through the last nonblank row, including internal blanks. */
export function rowsToSend(
  rows: readonly BulkRowState[],
  types: readonly FilterOption[],
  defaultTypeKey: string | null
): BatchRow[] {
  const last = lastNonBlankIndex(rows);
  if (last < 0) return [];
  return rows.slice(0, last + 1).map((row) => batchRow(row.draft, types, defaultTypeKey));
}

function ignoredColumnsCopy(columns: readonly string[]): string {
  if (columns.length === 0) return 'Read a header row.';
  if (columns.length === 1) {
    return `Read a header row. The ${columns[0]} column is not an item field and was left out.`;
  }
  const last = columns.at(-1) ?? '';
  return `Read a header row. The ${columns.slice(0, -1).join(', ')} and ${last} columns are not item fields and were left out.`;
}

/** Builds the explanatory note shown after a header-aware paste. */
export function pasteNote(header: boolean, ignoredColumns: readonly string[]): string {
  if (!header) return '';
  return ignoredColumnsCopy(ignoredColumns);
}

function withoutOneTrailingLineBreak(text: string): string {
  if (text.endsWith('\r\n')) return text.slice(0, -2);
  if (text.endsWith('\n')) return text.slice(0, -1);
  return text;
}

/** Whether a paste contains a table rather than one cell copied from a spreadsheet. */
export function isTakenOverPaste(text: string): boolean {
  const content = withoutOneTrailingLineBreak(text);
  return content.includes('\t') || /[\n\r]/u.test(content);
}

/** Converts an unknown request failure to the inventory error shown by the page. */
export function asInventoryApiError(error: unknown): InventoryApiError {
  if (error instanceof InventoryApiError) return error;
  if (error instanceof Error) return new InventoryApiError(error.message, undefined);
  return new InventoryApiError('inventory API request failed', undefined);
}
