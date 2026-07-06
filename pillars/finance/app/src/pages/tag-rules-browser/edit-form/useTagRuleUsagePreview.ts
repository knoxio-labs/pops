import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../finance-api-helpers.js';
import { tagRulesMatchPreview } from '../../../finance-api/index.js';

import type { MatchType } from '../types';

export interface TagRuleUsagePreviewMatch {
  id: string;
  checksum: string | null;
  date: string;
  description: string;
  amount: number;
  entityId: string | null;
  entityName: string | null;
}

interface UseTagRuleUsagePreviewArgs {
  ruleId: string | null;
  pattern: string;
  matchType: MatchType;
  enabled: boolean;
}

/**
 * Full-DB usage-history preview for an existing tag rule (CP020's core
 * value): unlike the import-wizard's `tagRules.preview`, which only samples
 * the current import batch, this scans every persisted transaction the
 * rule's `(pattern, matchType)` matches and returns the true total — so a
 * rule edit's blast radius is visible before it's saved.
 */
export function useTagRuleUsagePreview({
  ruleId,
  pattern,
  matchType,
  enabled,
}: UseTagRuleUsagePreviewArgs) {
  const query = useQuery({
    queryKey: ['finance', 'tagRules', 'matchPreview', ruleId, pattern, matchType],
    queryFn: async () =>
      unwrap(await tagRulesMatchPreview({ body: { pattern, matchType, limit: 25 } })),
    enabled: enabled && ruleId !== null,
    staleTime: 5_000,
  });

  return {
    matches: query.data?.data.matches ?? [],
    totalCount: query.data?.data.totalCount ?? 0,
    isFetching: query.isFetching,
    error: query.error ? { message: query.error.message } : null,
  };
}
