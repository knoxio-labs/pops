/**
 * The tag taxonomy an import step reads: the vocabulary and the facets.
 *
 * Shared by tag review, which offers these to its pickers, and by the steps
 * that stage tag rules, which check a rule against them before staging it
 * (POPS-3106). One query key per question, so every consumer shares one
 * cache entry and a commit's invalidation of `['finance', 'tagRules']` reaches
 * them all.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import { tagRulesFacets, tagRulesVocabulary } from '../../../finance-api/index.js';

import type { TagFacetOption } from '../../../lib/tags';

/**
 * The vocabulary alone, or `undefined` until it has loaded.
 *
 * Kept apart from {@link useAvailableTags} because a staged rule is checked
 * against what the vocabulary holds, and the tags already on this import's
 * rows are what that check is about.
 */
export function useVocabularyTags(): readonly string[] | undefined {
  const { data } = useQuery({
    queryKey: ['finance', 'tagRules', 'vocabulary'],
    queryFn: async () => unwrap(await tagRulesVocabulary()),
  });
  return data?.tags;
}

/**
 * Every tag a picker may match or offer, staged tags included.
 *
 * Sourced from the tag vocabulary rather than the tags currently sitting on a
 * transaction (`transactions.availableTags`): a value can be registered —
 * `fee:atm` created via a tag rule, say — before any loaded transaction
 * carries it, and a picker built from usage alone would call that value
 * unrecognised and route it into "create a new one" on a closed facet that
 * refuses to let it be created at all.
 */
export function useAvailableTags(localTags: Record<string, string[]>): string[] {
  const serverTags = useVocabularyTags();
  return useMemo(() => {
    const local = Object.values(localTags).flat();
    return [...new Set([...(serverTags ?? []), ...local])].toSorted();
  }, [serverTags, localTags]);
}

/**
 * The taxonomy the pickers offer to create tags on.
 *
 * Fetched rather than hard-coded so a facet added to the pillar reaches the UI
 * without a matching edit here; an unanswered query yields no axes, which the
 * pickers read as "nothing may be created yet" rather than falling back to a
 * guessed list.
 */
export function useTagFacets(): TagFacetOption[] {
  const { data } = useQuery({
    queryKey: ['finance', 'tagRules', 'facets'],
    queryFn: async () => unwrap(await tagRulesFacets()),
  });
  return data?.facets ?? [];
}
