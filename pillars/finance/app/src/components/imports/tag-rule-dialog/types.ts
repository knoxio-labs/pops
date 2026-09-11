import type {
  TagRulesApplyData,
  TagRulesProposeData,
  TagRulesProposeResponse,
  TagRulesRejectData,
  TagRulesRejectResponse,
} from '../../../finance-api/index.js';
import type { TagFacetOption } from '../../../lib/tags';

export type ProposeInput = NonNullable<TagRulesProposeData['body']>;
export type ProposeOutput = TagRulesProposeResponse;
export type ApplyInput = NonNullable<TagRulesApplyData['body']>;
export type RejectInput = NonNullable<TagRulesRejectData['body']>;
export type RejectOutput = TagRulesRejectResponse;

export interface TagRuleLearnSignal {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
}

export interface TagRuleProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signal: TagRuleLearnSignal | null;
  previewTransactions: Array<{
    checksum: string;
    description: string;
    entityId?: string | null;
    /** Present only for a hand-edited row — see `PreviewTransaction`. */
    userTags?: string[];
  }>;
  /**
   * Called when the user accepts the proposal. The dialog itself writes
   * nothing — the caller stages the ChangeSet and the accepted new-vocabulary
   * tags for the import commit (POPS-2597).
   */
  onApplied?: (
    changeSet: ProposeOutput['changeSet'],
    affected: ProposeOutput['preview']['affected'],
    acceptedNewTags: string[]
  ) => void;
  /**
   * The taxonomy and the vocabulary, to refuse a rule that would write a value
   * a closed axis does not hold before it is staged rather than at commit
   * (POPS-3106). The vocabulary must not include tags that are only on this
   * import's rows. Omitted, nothing is refused here and the commit still is.
   */
  facets?: readonly TagFacetOption[];
  vocabularyTags?: readonly string[];
}

/** Every tag the proposed ChangeSet would write, across all of its ops. */
export function tagsWrittenBy(proposal: ProposeOutput | undefined): string[] {
  return (proposal?.changeSet.ops ?? []).flatMap((op) =>
    'data' in op && op.data !== undefined && 'tags' in op.data && Array.isArray(op.data.tags)
      ? op.data.tags
      : []
  );
}

export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * The vocabulary tags this ChangeSet would introduce, over the whole import.
 *
 * Read off `preview.newTags` rather than walked out of `preview.affected`:
 * that list is capped at the panel's page size, so a large import would leave
 * the user unable to accept a tag the rule is about to create.
 */
export function collectNewTagNames(proposal: ProposeOutput | undefined): string[] {
  return proposal?.preview.newTags ?? [];
}
