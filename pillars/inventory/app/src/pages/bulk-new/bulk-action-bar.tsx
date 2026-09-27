import { Button } from '@pops/ui';

import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { plural } from './bulk-status.js';

import type { ReactElement } from 'react';

import type { BulkCounts, BulkPhase } from './use-bulk-entry.js';

/** Props for the action bar under the bulk-entry grid. */
export interface BulkActionBarProps {
  phase: BulkPhase;
  counts: BulkCounts;
  offline: boolean;
  onClear: () => void;
  onCreate: () => void;
}

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

/** Renders the bulk-entry count, clear action, and partial-create action. */
export function BulkActionBar({
  phase,
  counts,
  offline,
  onClear,
  onCreate,
}: BulkActionBarProps): ReactElement {
  const busy = phase === 'submitting' || phase === 'validating';
  const createButton = (
    <Button
      type="button"
      loading={phase === 'submitting'}
      loadingText="Creating"
      disabled={busy || counts.ready === 0 || offline}
      suffix={<ShortcutHint id="form-save" onPrimary />}
      onClick={onCreate}
    >
      {buttonLabel(counts)}
    </Button>
  );

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card py-1.5 pr-1.5 pl-4 shadow-lg">
      <p aria-live="polite" className="text-sm tabular-nums">
        {summaryText(phase, counts)}
      </p>
      <span className="ml-auto" />
      <Button type="button" variant="ghost" disabled={busy} onClick={onClear}>
        Clear grid
      </Button>
      {offline ? (
        <HintTooltip label="Create" disabledReason="No connection">
          {createButton}
        </HintTooltip>
      ) : (
        createButton
      )}
    </div>
  );
}
