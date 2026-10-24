import { toast } from 'sonner';

import { useImportIdentities } from '../hooks/useImportIdentities';
import { rulesStepHasProposals } from '../rule-creation/utils';
import { TAG_REVIEW_STEP } from '../step-labels';

import type { TagFacetOption } from '../../../lib/tags';
import type { ImportStore } from '../../../store/import-store-types';

type NavigationState = Pick<
  ImportStore,
  'confirmedTransactions' | 'pendingTagRuleChangeSets' | 'prevStep' | 'goToStep'
>;

/** Navigate through Rules only when a verified canonical grouping still has proposals to review. */
export function useRulesBackNavigation(state: NavigationState, facets: readonly TagFacetOption[]) {
  const { identities } = useImportIdentities();
  return () => {
    if (!identities) {
      toast.error('Contact identities are unavailable; retry before continuing.');
      return;
    }
    if (
      rulesStepHasProposals(
        state.confirmedTransactions,
        state.pendingTagRuleChangeSets,
        facets,
        identities
      )
    )
      state.prevStep();
    else state.goToStep(TAG_REVIEW_STEP);
  };
}
