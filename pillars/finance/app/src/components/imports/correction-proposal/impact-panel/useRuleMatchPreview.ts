import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../../finance-api-helpers.js';
import {
  type CorrectionsRuleMatchPreviewData,
  type CorrectionsRuleMatchPreviewResponse,
  correctionsRuleMatchPreview,
} from '../../../../finance-api/index.js';

/** Single page size — the total match count is always reported in full. */
const RULE_MATCH_PREVIEW_LIMIT = 100;

export type RuleMatchType = NonNullable<CorrectionsRuleMatchPreviewData['body']>['matchType'];
export type RuleMatchPreviewData = NonNullable<CorrectionsRuleMatchPreviewResponse>['data'];
export type RuleMatchPreviewRow = RuleMatchPreviewData['matches'][number];

/**
 * Fetch the transactions a `(pattern, matchType)` rule matches across the whole
 * finance DB. The response's `totalCount` reflects the full match set, while
 * `matches` is a single capped page — enough to eyeball whether the pattern is
 * too broad without streaming the entire library.
 */
export function useRuleMatchPreview(params: { pattern: string; matchType: RuleMatchType }) {
  const { pattern, matchType } = params;
  return useQuery({
    queryKey: [
      'finance',
      'corrections',
      'rule-match-preview',
      pattern,
      matchType,
      RULE_MATCH_PREVIEW_LIMIT,
    ],
    // Send the pattern byte-for-byte so the preview matches exactly what the
    // rule fires on (rules are persisted without trimming); the trim only gates
    // whether a whitespace-only pattern is worth a round-trip.
    queryFn: async (): Promise<RuleMatchPreviewData> =>
      unwrap(
        await correctionsRuleMatchPreview({
          body: { pattern, matchType, limit: RULE_MATCH_PREVIEW_LIMIT },
        })
      ).data,
    enabled: pattern.trim().length > 0,
    staleTime: 30_000,
  });
}
