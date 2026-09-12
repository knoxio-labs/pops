import { useMemo, useState } from 'react';

import { useImportStore } from '../../../store/importStore';
import { useTagRuleAddCollisions } from '../final-review/useTagRuleAddCollisions';
import { useRefusedProposals } from './refused-proposals';
import {
  batchRuleTempIds,
  buildChangeSet,
  computeProposals,
  IMPORT_BATCH_SOURCE,
  previouslyStagedProposalIds,
  type RuleProposal,
} from './utils';

/**
 * The Rules step's state: what is proposed once what already applies is
 * subtracted, which proposals are ticked, and the one exit, used by both
 * Create and Skip, that replaces whatever an earlier visit staged (POPS-3676).
 */
export function useRuleProposals() {
  const confirmedTransactions = useImportStore((s) => s.confirmedTransactions);
  const staged = useImportStore((s) => s.pendingTagRuleChangeSets);
  const addPendingTagRuleChangeSet = useImportStore((s) => s.addPendingTagRuleChangeSet);
  const removePendingTagRuleChangeSet = useImportStore((s) => s.removePendingTagRuleChangeSet);
  const nextStep = useImportStore((s) => s.nextStep);
  const prevStep = useImportStore((s) => s.prevStep);
  const proposals = useMemo(
    () => computeProposals(confirmedTransactions, staged),
    [confirmedTransactions, staged]
  );
  const refusedById = useRefusedProposals(proposals);
  const collisions = useTagRuleAddCollisions(proposals.map((proposal) => buildChangeSet(proposal)));
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(previouslyStagedProposalIds(proposals, staged))
  );
  const [prevProposals, setPrevProposals] = useState(proposals);
  if (proposals !== prevProposals) {
    setPrevProposals(proposals);
    setChecked(new Set(previouslyStagedProposalIds(proposals, staged)));
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function leaveStaging(chosen: RuleProposal[]) {
    for (const tempId of batchRuleTempIds(staged)) removePendingTagRuleChangeSet(tempId);
    for (const proposal of chosen) {
      addPendingTagRuleChangeSet({
        changeSet: buildChangeSet(proposal),
        source: IMPORT_BATCH_SOURCE,
        acceptedNewTags: proposal.tags,
        sourceChecksums: proposal.sourceChecksums,
      });
    }
    nextStep();
  }

  return {
    proposals,
    refusedById,
    collisions: collisions.data,
    checked,
    toggle,
    leaveStaging,
    prevStep,
  };
}
