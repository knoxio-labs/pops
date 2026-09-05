import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  tagRulesResolveAddCollisions,
  type TagRulesResolveAddCollisionsResponse,
} from '../../../finance-api/index.js';

import type { PendingTagRuleChangeSet } from '../../../store/import-store-types';

export type TagRuleAddCollision =
  NonNullable<TagRulesResolveAddCollisionsResponse>['collisions'][number][number];

/**
 * Whether each staged tag-rule `add` op would create a new rule or merge
 * into one that already exists (POPS-2955), resolved server-side against the
 * live `transaction_tag_rules` table — Final Review renders every `add` as a
 * plain ADD otherwise, because the collision is decided by the same
 * `(matchType, normalized descriptionPattern, entityId)` key the commit path
 * resolves against, and nothing client-side can answer that without either a
 * second copy of that key (drift risk) or fetching the paginated Tag Rules
 * browser list and treating a page as the complete set (POPS-2696).
 *
 * Returns `collisions[i][j]` lined up with `pendingTagRuleChangeSets[i].changeSet.ops[j]`
 * — `undefined` while the query has not resolved yet, so a caller not ready
 * to render provisional badges can fall back to the plain ADD label.
 */
export function useTagRuleAddCollisions(pendingTagRuleChangeSets: PendingTagRuleChangeSet[]) {
  const changeSets = pendingTagRuleChangeSets.map((pcs) => pcs.changeSet);
  const hasOps = changeSets.some((cs) => cs.ops.length > 0);
  return useQuery({
    queryKey: ['finance', 'tagRules', 'resolveAddCollisions', changeSets],
    queryFn: async (): Promise<TagRuleAddCollision[][]> =>
      unwrap(await tagRulesResolveAddCollisions({ body: { changeSets } })).collisions,
    enabled: hasOps,
    staleTime: 0,
  });
}
