import { CircleCheck, TriangleAlert } from 'lucide-react';

import { Input, cn } from '@pops/ui';

import { BULK_COLUMNS } from '../../foundation/list-page/paste-parser.js';

import type { ReactElement } from 'react';

import type { BulkColumn, BulkDraft } from '../../foundation/list-page/paste-parser.js';
import type { BulkIssue, BulkRowStatus } from './use-bulk-entry.js';

const HEADERS: Readonly<Record<BulkColumn, string>> = {
  name: 'Name',
  type: 'Type',
  quantity: 'Qty',
  code: 'Code',
  where: 'Where',
  note: 'Note',
};

const WIDTHS: Readonly<Record<BulkColumn, string>> = {
  name: 'min-w-40 flex-1',
  type: 'w-28 shrink-0 lg:w-36',
  quantity: 'w-16 shrink-0',
  code: 'w-24 shrink-0',
  where: 'w-36 shrink-0 lg:w-44',
  note: 'hidden w-40 shrink-0 lg:block',
};

function placeholders(destination: string): Readonly<Partial<Record<BulkColumn, string>>> {
  return { name: 'Required', type: 'Untyped', quantity: '1', where: destination };
}

/** Returns the accessible label shared by every cell and Enter navigation. */
export function cellLabel(column: BulkColumn, index: number): string {
  return `${HEADERS[column]}, row ${String(index + 1)}`;
}

function Status({ status, index }: { status: BulkRowStatus; index: number }): ReactElement {
  if (status === 'ready') {
    return (
      <CircleCheck className="size-4 text-success" aria-label={`Row ${String(index + 1)} ready`} />
    );
  }
  if (status === 'refused') {
    return (
      <TriangleAlert
        className="size-4 text-warning"
        aria-label={`Row ${String(index + 1)} needs fixing`}
      />
    );
  }
  return <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>;
}

/** Props for one controlled bulk-entry grid row. */
export interface BulkGridRowProps {
  draft: BulkDraft;
  index: number;
  status: BulkRowStatus;
  issues: readonly BulkIssue[];
  disabled?: boolean;
  hintWhere?: string;
  onCell: (column: BulkColumn, value: string) => void;
  onPaste: (text: string) => boolean;
  onEnter: (column: BulkColumn) => void;
}

interface GridCellProps {
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
}

function GridCell({
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
}: GridCellProps): ReactElement {
  return (
    <span role="gridcell" className={WIDTHS[column]}>
      <Input
        aria-label={cellLabel(column, index)}
        aria-invalid={refused.has(column) || undefined}
        aria-describedby={refused.has(column) ? errorId : undefined}
        value={draft[column]}
        placeholder={hints[column]}
        disabled={disabled}
        onChange={(event) => onCell(column, event.target.value)}
        onPaste={(event) => {
          if (onPaste(event.clipboardData.getData('text'))) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            onEnter(column);
          }
        }}
        className={cn(
          'h-8 rounded-sm border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input',
          column === 'code' && 'font-mono text-xs',
          column === 'quantity' && 'text-right tabular-nums',
          'aria-invalid:border-warning aria-invalid:bg-warning/10 aria-invalid:ring-0 dark:aria-invalid:ring-0'
        )}
      />
    </span>
  );
}

/** Renders one controlled bulk-entry row and its server issues. */
export function BulkGridRow({
  draft,
  index,
  status,
  issues,
  disabled = false,
  hintWhere,
  onCell,
  onPaste,
  onEnter,
}: BulkGridRowProps): ReactElement {
  const hints = hintWhere === undefined ? {} : placeholders(hintWhere);
  const refused = new Set(issues.map((issue) => issue.column));
  const errorId = `bulk-row-${String(index)}-issues`;
  return (
    <div
      role="row"
      className={cn('border-b last:border-b-0', status === 'refused' && 'bg-warning/5')}
    >
      <div className="flex h-10 items-center gap-1 pr-2">
        <span className="flex w-10 shrink-0 justify-center">
          <Status status={status} index={index} />
        </span>
        {BULK_COLUMNS.map((column) => (
          <GridCell
            key={column}
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
        ))}
      </div>
      {issues.length > 0 ? (
        <ul id={errorId} className="flex flex-wrap gap-x-4 gap-y-0.5 pb-2 pl-12 text-xs">
          {issues.map((issue, issueIndex) => (
            <li key={`${issue.column}-${issue.code}-${issue.message}-${String(issueIndex)}`}>
              <span className="font-medium">{HEADERS[issue.column]}:</span> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Renders the sticky bulk-entry grid header. */
export function BulkGridHeader(): ReactElement {
  return (
    <div
      role="row"
      className="sticky top-0 z-10 flex h-9 items-center gap-1 border-b bg-card pr-2 text-2xs font-semibold tracking-label text-muted-foreground uppercase"
    >
      <span className="w-10 shrink-0 text-center">#</span>
      {BULK_COLUMNS.map((column) => (
        <span key={column} role="columnheader" className={cn(WIDTHS[column], 'px-2')}>
          {HEADERS[column]}
          {column === 'name' ? <span className="text-app-accent"> *</span> : null}
        </span>
      ))}
    </div>
  );
}
