import { AlertTriangle } from 'lucide-react';

import { Button, EmptyStateTab } from '@pops/ui';

import { dropReason } from './buildConfirmed';
import { GroupedView, ListView, type ReviewTabBaseProps, ViewModeToggle } from './ReviewTabShared';

import type { ProcessedTransaction } from '../../../store/importStore';

export interface MatchedTabProps extends ReviewTabBaseProps {
  /** Show only the rows that will not commit. Ignored once none are left. */
  blockedOnly?: boolean;
  onBlockedOnlyChange?: (value: boolean) => void;
}

/**
 * Blocked rows first, then the rest in their original order. A blocked row is
 * the only one in the tab the user has to act on, and in a two-year export it
 * was somewhere in three thousand (POPS-3659).
 */
function blockedFirst(transactions: ProcessedTransaction[]): ProcessedTransaction[] {
  const blocked: ProcessedTransaction[] = [];
  const rest: ProcessedTransaction[] = [];
  for (const t of transactions) (dropReason(t) === null ? rest : blocked).push(t);
  return [...blocked, ...rest];
}

function BlockedFilter({
  blockedCount,
  blockedOnly,
  onBlockedOnlyChange,
}: {
  blockedCount: number;
  blockedOnly: boolean;
  onBlockedOnlyChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-warning">
      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
      <span>
        {blockedCount} of these won&apos;t be imported
        {blockedOnly ? ', and that is all you are seeing' : ''}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onBlockedOnlyChange(!blockedOnly)}
        aria-pressed={blockedOnly}
      >
        {blockedOnly ? 'Show all matched' : 'Show only these'}
      </Button>
    </div>
  );
}

/**
 * Matched tab (POPS-2448). A real import puts most of its rows here — a
 * two-year card export is over three thousand — and a flat list of that
 * length can only be scrolled past, not reviewed. Grouped by entity and
 * collapsed by default, a wrong match is one header to spot and one
 * "Reassign all" to fix, instead of one card per occurrence. The list view
 * is still there for reading rows in date order.
 *
 * Rows that cannot commit are pulled to the top of the list view and can be
 * shown on their own, since neither ordering finds them inside a collapsed
 * group (POPS-3659).
 */
export function MatchedTab({
  blockedOnly = false,
  onBlockedOnlyChange,
  ...props
}: MatchedTabProps) {
  if (props.transactions.length === 0) {
    return <EmptyStateTab message="No matched transactions" />;
  }
  const ordered = blockedFirst(props.transactions);
  const blockedCount = ordered.filter((t) => dropReason(t) !== null).length;
  const filtering = blockedOnly && blockedCount > 0;
  const listed = filtering ? ordered.slice(0, blockedCount) : ordered;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {blockedCount > 0 && onBlockedOnlyChange ? (
          <BlockedFilter
            blockedCount={blockedCount}
            blockedOnly={filtering}
            onBlockedOnlyChange={onBlockedOnlyChange}
          />
        ) : (
          <span />
        )}
        {/* While the filter is on the tab is a flat list whatever the stored
            mode says, so the toggle must show `list` rather than a `Grouped`
            that is pressed but not on screen; asking for Grouped clears the
            filter, which is the only way back to groups from here. */}
        <ViewModeToggle
          viewMode={filtering ? 'list' : props.viewMode}
          onViewModeChange={(mode) => {
            if (mode === 'grouped' && filtering) onBlockedOnlyChange?.(false);
            props.onViewModeChange(mode);
          }}
        />
      </div>
      {props.viewMode === 'grouped' && !filtering ? (
        <GroupedView variant="matched" props={props} />
      ) : (
        <ListView variant="matched" props={{ ...props, transactions: listed }} />
      )}
    </div>
  );
}
