/**
 * Step three: every row as it will be created, checked by bulk entry's
 * rules. Rows with problems are marked and say why; they will be skipped
 * and returned as a CSV, not block the rest.
 */
import { CircleCheck, TriangleAlert } from 'lucide-react';

import { cn } from '@pops/ui';

import { ListBody } from '../items-list/list-page';

import type { BulkDraft } from '../bulk-entry/paste-parser';
import type { BulkIssue } from '../bulk-entry/row-validation';

const COLS = [
  ['name', 'Name', 'min-w-32 flex-1'],
  ['type', 'Type', 'w-28 lg:w-32'],
  ['quantity', 'Qty', 'w-12 text-right'],
  ['code', 'Code', 'w-20 font-mono text-xs'],
  ['where', 'Where', 'w-32 lg:w-40'],
  ['note', 'Note', 'hidden w-40 lg:block'],
] as const;

/** Props for {@link PreviewStep}. */
export interface PreviewStepProps {
  rows: readonly BulkDraft[];
  issues: readonly BulkIssue[];
  /** Show only the rows that will be skipped. */
  onlyProblems?: boolean;
}

function PreviewRow({
  row,
  index,
  own,
}: {
  row: BulkDraft;
  index: number;
  own: readonly BulkIssue[];
}) {
  const bad = new Set(own.map((issue) => issue.column));
  return (
    <div role="row" className={cn('border-b last:border-b-0', own.length > 0 && 'bg-warning/5')}>
      <div className="flex h-9 items-center gap-3 pr-4 text-sm">
        <span className="flex w-12 items-center justify-center gap-1 text-xs tabular-nums text-muted-foreground">
          {own.length > 0 ? (
            <TriangleAlert className="size-3.5 text-warning" aria-label="Skipped" />
          ) : (
            <CircleCheck className="size-3.5 text-success" aria-label="Imported" />
          )}
          {index + 2}
        </span>
        {COLS.map(([key, , width]) => (
          <span
            key={key}
            className={cn(
              width,
              'truncate',
              bad.has(key) && 'rounded-sm bg-warning/15 px-1 font-medium'
            )}
          >
            {row[key] ||
              (key === 'type' ? <span className="text-muted-foreground">Untyped</span> : '')}
          </span>
        ))}
      </div>
      {own.length > 0 ? (
        <p className="pb-2 pl-15 text-xs">{own.map((issue) => issue.message).join(' ')}</p>
      ) : null}
    </div>
  );
}

/** The preview step. */
export function PreviewStep({ rows, issues, onlyProblems = false }: PreviewStepProps) {
  const shown = rows
    .map((row, index) => ({ row, index, own: issues.filter((issue) => issue.row === index) }))
    .filter((entry) => !onlyProblems || entry.own.length > 0);
  return (
    <ListBody>
      <div role="table" aria-label="Rows to import">
        <div
          role="row"
          className="sticky top-0 z-10 flex h-9 items-center gap-3 border-b bg-card pr-4 text-2xs font-semibold tracking-label text-muted-foreground uppercase"
        >
          <span className="w-12 text-center">Row</span>
          {COLS.map(([key, label, width]) => (
            <span key={key} className={cn(width, 'font-sans text-2xs')}>
              {label}
            </span>
          ))}
        </div>
        {shown.map(({ row, index, own }) => (
          <PreviewRow key={`row-${String(index)}`} row={row} index={index} own={own} />
        ))}
      </div>
    </ListBody>
  );
}
