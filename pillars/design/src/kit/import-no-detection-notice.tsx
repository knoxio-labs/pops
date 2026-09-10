import { AlertTriangle } from 'lucide-react';

/** The Map step's warning when no column name looked like a date, description or amount. */
export function NoDetectionNotice() {
  return (
    <div className="rounded-lg border border-warning/25 bg-warning/10 p-4 text-sm text-warning">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
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
