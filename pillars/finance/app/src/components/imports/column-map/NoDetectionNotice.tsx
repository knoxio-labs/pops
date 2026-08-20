import { AlertTriangle } from 'lucide-react';

/**
 * Say so when auto-detection matched nothing, rather than presenting the same
 * blank dropdowns a fresh mapping would show. Nothing matching usually means
 * the columns are unnamed, which the user can only act on if told.
 */
export function NoDetectionNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="font-medium">No columns matched automatically</p>
          <p className="text-xs">
            None of this file&apos;s column names look like a date, description or amount, so
            nothing was filled in. An export with no header row is listed as Column 1, Column 2 and
            so on — check the bank you picked on the previous step, then map each field below.
          </p>
        </div>
      </div>
    </div>
  );
}
