/**
 * The bar under the bulk grid: the count, Clear, and the one button, whose
 * label states the outcome: how many are created and how many stay to fix.
 */
import { Button } from '@pops/ui';

import { ShortcutHint } from '../foundation';
import { plural } from './bulk-status';

import type { BulkCounts, BulkPhase } from './bulk-status';

function buttonLabel(counts: BulkCounts): string {
  if (counts.ready === 0) return 'Create';
  if (counts.refused === 0) return `Create ${plural(counts.ready, 'item')}`;
  return `Create ${String(counts.ready)}, keep ${String(counts.refused)} to fix`;
}

function summaryText(phase: BulkPhase, counts: BulkCounts): string {
  if (counts.rows === 0) return 'Nothing typed yet';
  if (phase === 'editing' || phase === 'validating') return `${plural(counts.rows, 'row')} typed`;
  return `${plural(counts.rows, 'row')}: ${String(counts.ready)} ready, ${String(counts.refused)} to fix`;
}

/** The bar under the grid. */
export function BulkActionBar({ phase, counts }: { phase: BulkPhase; counts: BulkCounts }) {
  const busy = phase === 'submitting' || phase === 'validating';
  const summary = summaryText(phase, counts);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card py-1.5 pr-1.5 pl-4 shadow-lg">
      <p aria-live="polite" className="text-sm tabular-nums">
        {summary}
      </p>
      <span className="ml-auto" />
      <Button variant="ghost" disabled={busy}>
        Clear grid
      </Button>
      <Button
        loading={phase === 'submitting'}
        disabled={busy || counts.ready === 0}
        suffix={<ShortcutHint id="form-save" onPrimary />}
      >
        {buttonLabel(counts)}
      </Button>
    </div>
  );
}
