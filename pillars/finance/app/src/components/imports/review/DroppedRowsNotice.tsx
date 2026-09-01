import { AlertTriangle } from 'lucide-react';

import { dropReason } from './buildConfirmed';

import type { ProcessedTransaction } from '../../../store/importStore';

/**
 * What each dropped row is missing, so the notice names the actual fix rather
 * than listing both possibilities at every row (POPS-2754).
 */
function remedies(dropped: ProcessedTransaction[]): string[] {
  const reasons = new Set(dropped.map(dropReason));
  const lines: string[] = [];
  if (reasons.has('entity')) {
    lines.push('assign a merchant entity, or change the type to a non-merchant one');
  }
  if (reasons.has('type')) {
    lines.push(
      'set a transaction type on the money coming in — a credit is never assumed to be an expense'
    );
  }
  return lines;
}

/**
 * Non-blocking notice that some matched rows will not be imported: they need a
 * merchant entity (a `purchase`/`refund` or unset-type row with no resolved
 * entity), or they are credits nobody has typed, which the pillar refuses to
 * store rather than booking as spend (POPS-2754). The rows stay visible and
 * fixable in the Matched tab, so the drop is informed, not silent (#3765).
 * Rendered only when there is something to report.
 */
export function DroppedRowsNotice({ dropped }: { dropped: ProcessedTransaction[] }) {
  const count = dropped.length;
  if (count <= 0) return null;
  return (
    <div className="p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="font-medium">
            {count} matched transaction{count !== 1 ? 's' : ''} won&apos;t be imported
          </p>
          <ul className="text-xs list-disc list-inside">
            {remedies(dropped).map((line) => (
              <li key={line}>In the Matched tab, {line}.</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
