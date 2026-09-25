/**
 * The Moving day segment's lead: how far packing has got, as one bar and
 * four numbers, and the one bulk act moving day needs most: labels for the
 * boxes that are closed.
 */
import { Button } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';

import type { PackingProgress } from './containers-model';

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

/** The packing progress strip. */
export function PackingStrip({ progress }: { progress: PackingProgress }) {
  const total = progress.closed + progress.fullButOpen + progress.open;
  const closedShare = total === 0 ? 0 : Math.round((progress.closed / total) * 100);
  const fullShare = total === 0 ? 0 : Math.round((progress.fullButOpen / total) * 100);
  const Label = INVENTORY_ICONS.label;
  return (
    <div className="flex items-center gap-5 rounded-lg border bg-card px-4 py-2.5">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-5">
          <Figure value={progress.closed} label={`of ${String(total)} closed`} />
          <Figure value={progress.fullButOpen} label="full, still open" />
          <Figure value={progress.open} label="still being packed" />
          <Figure value={progress.packedItems} label="items packed" />
        </div>
        <div
          role="progressbar"
          aria-valuenow={closedShare}
          aria-label={`${String(closedShare)}% of containers closed`}
          className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <span className="bg-app-accent" style={{ width: `${String(closedShare)}%` }} />
          <span className="bg-app-accent/40" style={{ width: `${String(fullShare)}%` }} />
        </div>
      </div>
      <Button variant="outline" size="sm" prefix={<Label className="size-4" aria-hidden />}>
        Print labels for {progress.closed} closed
      </Button>
    </div>
  );
}
