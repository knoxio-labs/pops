/**
 * Which rule-creation proposals would write a value a closed tag axis does not
 * hold. Such a rule is refused where it is proposed rather than at commit,
 * where the whole import would be rejected over it (POPS-3106).
 */
import { useMemo } from 'react';

import { closedValuesOutsideVocabulary } from '../../../lib/tags';
import { useTagFacets, useVocabularyTags } from '../tag-review/useTagTaxonomy';

import type { RuleProposal } from './utils';

/**
 * Refused closed-axis values by proposal id. Until the taxonomy and vocabulary
 * load nothing is refused; the commit still checks.
 */
export function useRefusedProposals(proposals: RuleProposal[]): ReadonlyMap<string, string[]> {
  const facets = useTagFacets();
  const vocabularyTags = useVocabularyTags();
  return useMemo(() => {
    const refused = new Map<string, string[]>();
    if (vocabularyTags === undefined) return refused;
    for (const proposal of proposals) {
      const tags = closedValuesOutsideVocabulary(proposal.tags, facets, vocabularyTags);
      if (tags.length > 0) refused.set(proposal.id, tags);
    }
    return refused;
  }, [proposals, facets, vocabularyTags]);
}

/** The checked proposals that may be staged: everything checked and not refused. */
export function stageable(
  proposals: RuleProposal[],
  checked: ReadonlySet<string>,
  refusedById: ReadonlyMap<string, string[]>
): RuleProposal[] {
  return proposals.filter((p) => checked.has(p.id) && !refusedById.has(p.id));
}
