/**
 * The bulk entry grid: one row per item, every cell plain text so a paste
 * lands the way the spreadsheet had it. Tab and Enter move like a
 * spreadsheet; a row's status sits in its number column; a refused cell is
 * outlined and its reason is written under the row, never in a tooltip.
 */
import { CircleCheck, TriangleAlert } from 'lucide-react';

import { Input, cn } from '@pops/ui';

import { BULK_COLUMNS } from './paste-parser';

import type { BulkColumn, BulkDraft } from './paste-parser';
import type { BulkIssue } from './row-validation';

/** How a row reads right now. */
export type RowStatus = 'blank' | 'ready' | 'refused' | 'unchecked';

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

function Status({ status, index }: { status: RowStatus; index: number }) {
  if (status === 'ready')
    return (
      <CircleCheck className="size-4 text-success" aria-label={`Row ${String(index + 1)} ready`} />
    );
  if (status === 'refused')
    return (
      <TriangleAlert
        className="size-4 text-warning"
        aria-label={`Row ${String(index + 1)} needs fixing`}
      />
    );
  return <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>;
}

/** Props for {@link BulkGridRow}. */
export interface BulkGridRowProps {
  draft: BulkDraft;
  index: number;
  status: RowStatus;
  issues: readonly BulkIssue[];
  disabled?: boolean;
  /** What a blank Where means, shown as the cell's placeholder on the next row to type. */
  hintWhere?: string;
}

/** One grid row. */
export function BulkGridRow({
  draft,
  index,
  status,
  issues,
  disabled = false,
  hintWhere,
}: BulkGridRowProps) {
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
          <span key={column} role="gridcell" className={WIDTHS[column]}>
            <Input
              aria-label={`${HEADERS[column]}, row ${String(index + 1)}`}
              aria-invalid={refused.has(column) || undefined}
              aria-describedby={refused.has(column) ? errorId : undefined}
              defaultValue={draft[column]}
              placeholder={hints[column]}
              disabled={disabled}
              className={cn(
                'h-8 rounded-sm border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input dark:bg-transparent',
                column === 'code' && 'font-mono text-xs',
                column === 'quantity' && 'text-right tabular-nums',
                'aria-invalid:border-warning aria-invalid:bg-warning/10 aria-invalid:ring-0 dark:aria-invalid:ring-0'
              )}
            />
          </span>
        ))}
      </div>
      {issues.length > 0 ? (
        <ul id={errorId} className="flex flex-wrap gap-x-4 gap-y-0.5 pb-2 pl-12 text-xs">
          {issues.map((issue) => (
            <li key={`${issue.column}-${issue.message}`}>
              <span className="font-medium">{HEADERS[issue.column]}:</span> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The grid's header row. */
export function BulkGridHeader() {
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
