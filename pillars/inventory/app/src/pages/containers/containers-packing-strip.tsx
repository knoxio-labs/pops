import { Button } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';

import type { ReactElement } from 'react';

import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';

function Figure({ value, label }: { value: number; label: string }): ReactElement {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function printLabel(closed: number, printable: number): string {
  if (closed === 0) return 'Print labels';
  if (printable < closed) return `Print labels for ${printable} of ${closed} closed`;
  return `Print labels for ${closed} closed`;
}

/** Renders server-provided moving-day packing progress and its bounded label action. */
export function ContainersPackingStrip({
  progress,
  printableCount,
  onPrint,
}: {
  progress: WebSummaryGetResponse['packing'];
  printableCount: number;
  onPrint: () => void;
}): ReactElement {
  const total = progress.closed + progress.fullButOpen + progress.open;
  const closedShare = total === 0 ? 0 : Math.round((progress.closed / total) * 100);
  const fullShare = total === 0 ? 0 : Math.round((progress.fullButOpen / total) * 100);
  const Label = INVENTORY_ICONS.label;
  return (
    <div className="flex shrink-0 items-center gap-5 rounded-lg border bg-card px-4 py-2.5">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Figure value={progress.closed} label={`of ${String(total)} closed`} />
          <Figure value={progress.fullButOpen} label="full, still open" />
          <Figure value={progress.open} label="still being packed" />
          <Figure value={progress.packedItems} label="items packed" />
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={closedShare}
          aria-label={`${String(closedShare)}% of containers closed`}
          className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <span className="bg-app-accent" style={{ width: `${String(closedShare)}%` }} />
          <span className="bg-app-accent/40" style={{ width: `${String(fullShare)}%` }} />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={progress.closed === 0 || printableCount === 0}
        onClick={onPrint}
        prefix={<Label className="size-4" aria-hidden />}
      >
        {printLabel(progress.closed, printableCount)}
      </Button>
    </div>
  );
}
