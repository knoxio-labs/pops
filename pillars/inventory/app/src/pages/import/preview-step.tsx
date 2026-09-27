import { CircleCheck, TriangleAlert } from 'lucide-react';

import { cn } from '@pops/ui';

import { ListBody } from '../../foundation/items-table/list-body.js';

import type { ReactElement } from 'react';

import type { BulkColumn } from '../../foundation/list-page/paste-parser.js';
import type { ImportRowResult } from './use-import.js';

const COLS: readonly [BulkColumn, string, string][] = [
  ['name', 'Name', 'min-w-32 flex-1'],
  ['type', 'Type', 'w-28 lg:w-32'],
  ['quantity', 'Qty', 'w-12 text-right'],
  ['code', 'Code', 'w-20 font-mono text-xs'],
  ['where', 'Where', 'w-32 lg:w-40'],
  ['note', 'Note', 'hidden w-40 lg:block'],
];

/** Props for the preview step. */
export interface PreviewStepProps {
  results: readonly ImportRowResult[];
  /** Shows only rows that will be skipped. */
  onlyProblems?: boolean;
}

function PreviewRow({
  result,
  own,
}: {
  result: ImportRowResult;
  own: ImportRowResult['issues'];
}): ReactElement {
  const bad = new Set(own.map((issue) => issue.column));
  const skipped = result.status === 'skipped';
  return (
    <div role="row" className={cn('border-b last:border-b-0', skipped && 'bg-warning/5')}>
      <div className="flex h-9 items-center gap-3 pr-4 text-sm">
        <span className="flex w-12 items-center justify-center gap-1 text-xs tabular-nums text-muted-foreground">
          {skipped ? (
            <TriangleAlert className="size-3.5 text-warning" aria-label="Skipped" />
          ) : (
            <CircleCheck className="size-3.5 text-success" aria-label="Imported" />
          )}
          {result.row + 2}
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
            {result.draft[key] ||
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

/** Renders server outcomes for every non-blank parsed row. */
export function PreviewStep({ results, onlyProblems = false }: PreviewStepProps): ReactElement {
  const shown = results
    .filter((result) => result.status !== 'blank')
    .filter((result) => !onlyProblems || result.status === 'skipped');
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
        {shown.map((result) => (
          <PreviewRow key={`row-${String(result.row)}`} result={result} own={result.issues} />
        ))}
      </div>
    </ListBody>
  );
}
