import { Loader2, Settings2 } from 'lucide-react';

import { Button } from '@pops/ui';

export function ReviewHeader({
  unresolvedCount,
  browseOpen,
  setBrowseOpen,
  isReevaluating = false,
}: {
  unresolvedCount: number;
  browseOpen: boolean;
  setBrowseOpen: (v: boolean) => void;
  /** True while accepted suggestions are still being applied server-side. */
  isReevaluating?: boolean;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Review</h2>
        {/* Accepting a suggestion re-evaluates the whole session server-side,
            which on a large import is slow enough to look like nothing
            happened — and slower still when it has to recover a session a
            deploy wiped. Saying so is the difference between waiting and
            assuming the import broke. */}
        {isReevaluating ? (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Applying your changes to the remaining transactions…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {unresolvedCount > 0
              ? `${unresolvedCount} transaction(s) need your attention`
              : 'All transactions are ready to import'}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={() => setBrowseOpen(true)} disabled={browseOpen}>
        <Settings2 className="mr-1.5 h-4 w-4" />
        Manage Rules
      </Button>
    </div>
  );
}

export function ReviewFooter({
  unresolvedCount,
  committedCount,
  onBack,
  onContinue,
}: {
  unresolvedCount: number;
  committedCount: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex justify-between gap-3 items-center">
      <Button variant="outline" onClick={onBack} title="Back to column mapping">
        Back
      </Button>
      <div className="flex flex-col items-end gap-1">
        {unresolvedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Resolve all uncertain/failed transactions to continue
          </p>
        )}
        <Button onClick={onContinue} disabled={unresolvedCount > 0}>
          {`Continue to Tag Review (${committedCount})`}
        </Button>
      </div>
    </div>
  );
}
