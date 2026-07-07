import { AlertTriangle } from 'lucide-react';

/**
 * Non-blocking notice that some matched rows will not be imported because they
 * need a merchant entity (a `purchase`/`refund` or unset-type row with no
 * resolved entity). The rows stay visible and fixable in the Matched tab —
 * assign an entity or change the type — so the drop is informed, not silent
 * (#3765). Rendered only when `count > 0`.
 */
export function DroppedRowsNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="font-medium">
            {count} matched transaction{count !== 1 ? 's' : ''} won&apos;t be imported
          </p>
          <p className="text-xs">
            {count === 1 ? 'It needs' : 'They need'} a merchant entity or a non-merchant type.
            Assign an entity or change the transaction type in the Matched tab to include{' '}
            {count === 1 ? 'it' : 'them'}.
          </p>
        </div>
      </div>
    </div>
  );
}
