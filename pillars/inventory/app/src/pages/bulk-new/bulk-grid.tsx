import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';

import { cn } from '@pops/ui';

import {
  BULK_COLUMNS,
  type BulkColumn,
  type BulkDraft,
} from '../../foundation/list-page/paste-parser.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { BULK_GRID_HEADERS, BULK_GRID_WIDTHS, BulkGridCell } from './bulk-grid-cell.js';
import { buildBulkTypeTree } from './bulk-grid-type-picker.js';

import type { BulkIssue, BulkRowStatus } from './use-bulk-entry.js';

export { cellLabel } from './bulk-grid-cell.js';

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

function placeholders(destination: string): Readonly<Partial<Record<BulkColumn, string>>> {
  return { name: 'Required', type: 'Untyped', quantity: '1', where: destination };
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
  const catalogue = useCatalogueLookups();
  const typeNodes = useMemo(() => buildBulkTypeTree(catalogue.types), [catalogue.types]);
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
          <BulkGridCell
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
            typeNodes={typeNodes}
            types={catalogue.types}
          />
        ))}
      </div>
      {issues.length > 0 ? (
        <ul id={errorId} className="flex flex-wrap gap-x-4 gap-y-0.5 pb-2 pl-12 text-xs">
          {issues.map((issue, issueIndex) => (
            <li key={`${issue.column}-${issue.code}-${issue.message}-${String(issueIndex)}`}>
              <span className="font-medium">{BULK_GRID_HEADERS[issue.column]}:</span>{' '}
              {issue.message}
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
        <span key={column} role="columnheader" className={cn(BULK_GRID_WIDTHS[column], 'px-2')}>
          {BULK_GRID_HEADERS[column]}
          {column === 'name' ? <span className="text-app-accent"> *</span> : null}
        </span>
      ))}
    </div>
  );
}
