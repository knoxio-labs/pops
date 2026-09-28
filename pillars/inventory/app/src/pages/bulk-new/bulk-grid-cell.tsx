import { type ClipboardEvent, type KeyboardEvent, type ReactElement } from 'react';

import { Input, cn, type TreeNode } from '@pops/ui';

import { type BulkColumn, type BulkDraft } from '../../foundation/list-page/paste-parser.js';
import { BulkTypePicker, type BulkTypePickerNodeData } from './bulk-grid-type-picker.js';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

/** Labels displayed by the bulk-entry grid and its accessible cell names. */
export const BULK_GRID_HEADERS: Readonly<Record<BulkColumn, string>> = {
  name: 'Name',
  type: 'Type',
  quantity: 'Qty',
  code: 'Code',
  where: 'Where',
  note: 'Note',
};

/** Width classes shared by the bulk-entry grid header and cells. */
export const BULK_GRID_WIDTHS: Readonly<Record<BulkColumn, string>> = {
  name: 'min-w-40 flex-1',
  type: 'w-28 shrink-0 lg:w-36',
  quantity: 'w-16 shrink-0',
  code: 'w-24 shrink-0',
  where: 'w-36 shrink-0 lg:w-44',
  note: 'hidden w-40 shrink-0 lg:block',
};

const CELL_INPUT_CLASS =
  'h-8 rounded-sm border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input';

/** Returns the accessible label shared by every cell and Enter navigation. */
export function cellLabel(column: BulkColumn, index: number): string {
  return `${BULK_GRID_HEADERS[column]}, row ${String(index + 1)}`;
}

function takePaste(
  event: ClipboardEvent<HTMLInputElement>,
  onPaste: (text: string) => boolean
): void {
  if (onPaste(event.clipboardData.getData('text'))) event.preventDefault();
}

function moveOnEnter(
  event: KeyboardEvent<HTMLInputElement>,
  column: BulkColumn,
  onEnter: (column: BulkColumn) => void
): void {
  if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  onEnter(column);
}

interface BulkGridCellProps {
  column: BulkColumn;
  draft: BulkDraft;
  index: number;
  hints: Readonly<Partial<Record<BulkColumn, string>>>;
  refused: ReadonlySet<BulkColumn>;
  errorId: string;
  disabled: boolean;
  onCell: (column: BulkColumn, value: string) => void;
  onPaste: (text: string) => boolean;
  onEnter: (column: BulkColumn) => void;
  typeNodes: readonly TreeNode<BulkTypePickerNodeData>[];
  types: readonly CatalogueType[];
}

function CellInput({
  column,
  draft,
  index,
  hints,
  refused,
  errorId,
  disabled,
  onCell,
  onPaste,
  onEnter,
}: Omit<BulkGridCellProps, 'typeNodes' | 'types'>): ReactElement {
  return (
    <Input
      aria-label={cellLabel(column, index)}
      aria-invalid={refused.has(column) || undefined}
      aria-describedby={refused.has(column) ? errorId : undefined}
      value={draft[column]}
      placeholder={hints[column]}
      disabled={disabled}
      onChange={(event) => onCell(column, event.target.value)}
      onPaste={(event) => takePaste(event, onPaste)}
      onKeyDown={(event) => moveOnEnter(event, column, onEnter)}
      className={cn(
        CELL_INPUT_CLASS,
        column === 'code' && 'font-mono text-xs',
        column === 'quantity' && 'text-right tabular-nums',
        'aria-invalid:border-warning aria-invalid:bg-warning/10 aria-invalid:ring-0 dark:aria-invalid:ring-0'
      )}
    />
  );
}

/** Renders one controlled grid cell with optional hierarchical type selection. */
export function BulkGridCell({
  column,
  draft,
  index,
  hints,
  refused,
  errorId,
  disabled,
  onCell,
  onPaste,
  onEnter,
  typeNodes,
  types,
}: BulkGridCellProps): ReactElement {
  return (
    <span role="gridcell" className={cn(BULK_GRID_WIDTHS[column], column === 'type' && 'relative')}>
      <CellInput
        column={column}
        draft={draft}
        index={index}
        hints={hints}
        refused={refused}
        errorId={errorId}
        disabled={disabled}
        onCell={onCell}
        onPaste={onPaste}
        onEnter={onEnter}
      />
      {column === 'type' && typeNodes.length > 0 ? (
        <BulkTypePicker
          index={index}
          value={draft.type}
          types={types}
          nodes={typeNodes}
          disabled={disabled}
          onChange={(value) => onCell('type', value)}
        />
      ) : null}
    </span>
  );
}
