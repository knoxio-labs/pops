import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../../finance-api-helpers.js';
import { correctionsListMerged } from '../../../../finance-api/index.js';
import {
  applyBrowsePriorityMove,
  applyBrowsePriorityReorder,
  planBrowsePriorityMove,
  sortRulesForBrowseDisplay,
} from '../../../../lib/correction-browse-reorder';
import { toRestPendingChangeSets } from '../../../../lib/rest-changeset';
import { useImportStore } from '../../../../store/importStore';

import type { LocalOp } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

interface UseBrowseRulesArgs {
  open: boolean;
  localOps: LocalOp[];
  browseSearch: string;
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
}

/**
 * Rules rendered at once. The server orders the merged set by confidence, not
 * priority, so this window is a cross-section of priority order rather than a
 * prefix of it — which is why a reorder within it may not renumber it.
 */
const BROWSE_WINDOW = 500;

interface CorrectionsListMergedResult {
  data: CorrectionRule[];
  pagination: { total: number; limit: number; offset: number };
}

/**
 * Renumbering the window to 10, 20, 30 … is only sound when the window IS the
 * rule set. Over a partial window it rewrites the priority of every rule shown
 * and none of the rules not shown, interleaving the two — so a partial window
 * moves the dragged rule alone, to a priority between its new neighbours.
 */
function reorderOnDrop(
  reordered: CorrectionRule[],
  movedRuleId: string,
  windowComplete: boolean,
  setLocalOps: UseBrowseRulesArgs['setLocalOps']
) {
  if (windowComplete) {
    setLocalOps((prev) => applyBrowsePriorityReorder(reordered, prev));
    return;
  }
  setLocalOps((prev) => {
    const move = planBrowsePriorityMove(reordered, movedRuleId, prev);
    if (move.kind === 'blocked') {
      toast.error(`Could not reorder: ${move.reason}`);
      return prev;
    }
    const rule = reordered.find((r) => r.id === movedRuleId);
    if (!rule) return prev;
    return applyBrowsePriorityMove(move, rule, prev);
  });
}

export function useBrowseRules({ open, localOps, browseSearch, setLocalOps }: UseBrowseRulesArgs) {
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const pendingInput = useMemo(
    () => toRestPendingChangeSets(pendingChangeSets),
    [pendingChangeSets]
  );
  // Server-side merge — folds the full DB rule set with pending ChangeSets
  // BEFORE slicing, so the client never sees `NotFoundError` for an op
  // targeting a rule outside the page window. The render surface is capped
  // at BROWSE_WINDOW to keep DnD-driven priority reorders responsive.
  const browseListQuery = useQuery({
    queryKey: [
      'finance',
      'corrections',
      'listMerged',
      { pendingInput, limit: BROWSE_WINDOW, offset: 0 },
    ],
    queryFn: async (): Promise<CorrectionsListMergedResult> =>
      unwrap(
        await correctionsListMerged({
          body: { pendingChangeSets: pendingInput, limit: BROWSE_WINDOW, offset: 0 },
        })
      ),
    enabled: open,
    staleTime: 30_000,
  });
  const browseMergedRules: CorrectionRule[] = useMemo(
    () => browseListQuery.data?.data ?? [],
    [browseListQuery.data?.data]
  );

  const browseOrderedMerged = useMemo(
    () => sortRulesForBrowseDisplay(browseMergedRules, localOps),
    [browseMergedRules, localOps]
  );
  const browseOrderedFiltered = useMemo(() => {
    const needle = browseSearch.trim().toLowerCase();
    if (!needle) return browseOrderedMerged;
    return browseOrderedMerged.filter((r) => {
      const haystack =
        `${r.descriptionPattern} ${r.entityName ?? ''} ${r.matchType} ${r.location ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [browseOrderedMerged, browseSearch]);

  const browseTotal = browseListQuery.data?.pagination.total ?? browseMergedRules.length;
  const browseWindowComplete = browseTotal <= browseMergedRules.length;

  const browseCanDragReorder = browseSearch.trim() === '' && browseOrderedMerged.length >= 2;

  const handleBrowseReorderFullList = (reordered: CorrectionRule[], movedRuleId: string) => {
    reorderOnDrop(reordered, movedRuleId, browseWindowComplete, setLocalOps);
  };

  return {
    browseListQuery,
    browseMergedRules,
    browseOrderedMerged,
    browseOrderedFiltered,
    browseCanDragReorder,
    browseTotal,
    browseWindowComplete,
    handleBrowseReorderFullList,
  };
}
