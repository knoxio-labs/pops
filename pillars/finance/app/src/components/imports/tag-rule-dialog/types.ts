import type {
  TagRulesApplyData,
  TagRulesProposeData,
  TagRulesProposeResponse,
  TagRulesRejectData,
  TagRulesRejectResponse,
} from '../../../finance-api/index.js';

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
