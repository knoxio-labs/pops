/**
 * Internal TS shapes for the tag-rules domain logic. The zod request/
 * response schemas live in the REST contract (`rest-tag-rules.ts`); these
 * interfaces back the deterministic preview/propose computation.
 */
import type { TagRuleChangeSet } from '../../../contract/rest-tag-rules.js';

export type TagSuggestionSource = 'tag_rule' | 'rule' | 'ai' | 'entity';

export interface TagSuggestion {
  tag: string;
  source: TagSuggestionSource;
  pattern?: string;
  /** True when the tag is not yet in the user vocabulary. */
  isNew?: boolean;
}

export interface TagRuleSuggestionOutcome {
  suggestedTags: TagSuggestion[];
}

/**
 * Impact totals, computed over every previewed transaction rather than the
 * capped `affected` page.
 *
 * `affected` counts rows whose suggestion set changed at all; `suggestionChanges`
 * counts the individual tag additions and removals across those rows, of which
 * `removed` is the losing half. They are three different numbers — the old
 * shape had `affected` and `suggestionChanges` equal by construction.
 */
export interface TagRuleImpactCounts {
  /** Rows whose suggested-tag set changed. */
  affected: number;
  /** Individual tag additions + removals across those rows. */
  suggestionChanges: number;
  /** Of `suggestionChanges`, the tags a row would lose. */
  removed: number;
  /** Added tags not yet in the user vocabulary (counted per row). */
  newTagProposals: number;
}

export interface TagRuleImpactItem {
  transactionId: string;
  description: string;
  before: TagRuleSuggestionOutcome;
  after: TagRuleSuggestionOutcome;
}

export interface TagRulePreview {
  /** Totals over the full input set — never truncated to `affected`'s page. */
  counts: TagRuleImpactCounts;
  /** Per-row detail, capped at the request's `maxPreviewItems`. */
  affected: TagRuleImpactItem[];
  /**
   * Distinct added tags absent from the vocabulary, over the full input set.
   * The accept-before-saving panel reads this rather than walking `affected`,
   * which would miss every new tag past the cap.
   */
  newTags: string[];
}

export interface TagRuleChangeSetProposal {
  changeSet: TagRuleChangeSet;
  rationale: string;
  preview: TagRulePreview;
}

/** A transaction the caller wants previewed against a ChangeSet. */
export interface PreviewInputTransaction {
  transactionId: string;
  description: string;
  entityId?: string | null;
  /**
   * The row's hand-edited tags. Present ⇒ the user has decided this row and a
   * rule suggestion can never override it, so the row is excluded from the
   * impact set. Absent ⇒ untouched. An empty array is an edit, not an absence.
   */
  userTags?: string[];
}
