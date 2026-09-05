import { AlertTriangle } from 'lucide-react';

import { cn } from '@pops/ui';

import { describesUncategorizedTransactions, importWarningTitle } from './import-warnings';

import type { ImportWarning } from '@pops/finance';

interface ImportWarningBannerProps {
  warning: ImportWarning;
  /** Tail copy appended directly after "could not be automatically categorized" (include leading punctuation). */
  affectedHint: string;
  className?: string;
}

export function ImportWarningBanner({
  warning,
  affectedHint,
  className,
}: ImportWarningBannerProps) {
  return (
    <div
      className={cn(
        'p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="font-medium">{importWarningTitle(warning.type)}</p>
          <p className="text-xs">{warning.message}</p>
          {warning.details && <p className="text-xs opacity-70 font-mono">{warning.details}</p>}
          {warning.affectedCount && describesUncategorizedTransactions(warning.type) && (
            <p className="text-xs opacity-80">
              {warning.affectedCount} transaction
              {warning.affectedCount !== 1 ? 's' : ''} could not be automatically categorized
              {affectedHint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
