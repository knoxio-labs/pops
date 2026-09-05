import { EmptyStateTab } from '@pops/ui';

import { GroupedView, ListView, type ReviewTabBaseProps, ViewModeToggle } from './ReviewTabShared';

/**
 * Matched tab (POPS-2448). A real import puts most of its rows here — a
 * two-year card export is over three thousand — and a flat list of that
 * length can only be scrolled past, not reviewed. Grouped by entity and
 * collapsed by default, a wrong match is one header to spot and one
 * "Reassign all" to fix, instead of one card per occurrence. The list view
 * is still there for reading rows in date order.
 */
export function MatchedTab(props: ReviewTabBaseProps) {
  if (props.transactions.length === 0) {
    return <EmptyStateTab message="No matched transactions" />;
  }
  return (
    <div className="space-y-4">
      <ViewModeToggle viewMode={props.viewMode} onViewModeChange={props.onViewModeChange} />
      {props.viewMode === 'grouped' ? (
        <GroupedView variant="matched" props={props} />
      ) : (
        <ListView variant="matched" props={props} />
      )}
    </div>
  );
}
