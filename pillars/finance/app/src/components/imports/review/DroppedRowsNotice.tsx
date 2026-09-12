import { AlertTriangle } from 'lucide-react';

import { Button } from '@pops/ui';

import { dropReason } from './buildConfirmed';
import { dropReasonCopy } from './drop-reason-copy';

import type { ProcessedTransaction } from '../../../store/importStore';

/** How many rows the notice names before it falls back to a count. */
const NAMED_ROW_LIMIT = 5;

/** What each dropped row is missing, so the notice names the actual fix rather
 * than listing both possibilities at every row (POPS-2754). */
function remedies(dropped: ProcessedTransaction[]): string[] {
  const reasons = new Set(dropped.map(dropReason));
  return (['entity', 'type'] as const)
    .filter((reason) => reasons.has(reason))
    .map((reason) => dropReasonCopy[reason].remedy);
}

function DroppedRow({ transaction }: { transaction: ProcessedTransaction }) {
  const reason = dropReason(transaction);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-medium">{transaction.description}</span>
      <span className="opacity-80">
        {transaction.date} • ${Math.abs(transaction.amount).toFixed(2)}
      </span>
      {reason && <span className="opacity-80">— {dropReasonCopy[reason].label}</span>}
    </li>
  );
}

/**
 * Non-blocking notice that some matched rows will not be imported: they need a
 * merchant entity (a `purchase`/`refund` or unset-type row with no resolved
 * entity), or they are credits nobody has typed, which the pillar refuses to
 * store rather than booking as spend (POPS-2754). The rows stay visible and
 * fixable in the Matched tab, so the drop is informed, not silent (#3765).
 *
 * It names the offending rows and offers to jump to them because the count
 * alone was unactionable: the Matched tab is grouped and collapsed by default,
 * so "1 of 65 won't import" left the user opening groups at random (POPS-3659).
 * Rendered only when there is something to report.
 */
export function DroppedRowsNotice({
  dropped,
  onShowDropped,
}: {
  dropped: ProcessedTransaction[];
  /** Reveals the dropped rows in the Matched tab; omitted where nothing can navigate. */
  onShowDropped?: () => void;
}) {
  const count = dropped.length;
  if (count <= 0) return null;
  const named = dropped.slice(0, NAMED_ROW_LIMIT);
  const unnamed = count - named.length;
  return (
    <div className="p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <p className="font-medium">
            {count} matched transaction{count !== 1 ? 's' : ''} won&apos;t be imported
          </p>
          <ul className="text-xs space-y-0.5" data-testid="dropped-rows">
            {named.map((transaction) => (
              <DroppedRow key={transaction.checksum} transaction={transaction} />
            ))}
            {unnamed > 0 && <li className="opacity-80">and {unnamed} more</li>}
          </ul>
          <ul className="text-xs list-disc list-inside">
            {remedies(dropped).map((line) => (
              <li key={line}>In the Matched tab, {line}.</li>
            ))}
          </ul>
          {onShowDropped && (
            <Button variant="outline" size="sm" onClick={onShowDropped}>
              Show {count !== 1 ? 'these rows' : 'this row'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
