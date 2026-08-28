/**
 * Tag-loading + suggestion glue for the import pipeline.
 *
 * Ported from the monolith `lib/tag-management.ts`, db-injected: `loadKnownTags`
 * takes a `FinanceDb` handle and `buildSuggestedTags` forwards to the pillar's
 * own `suggestTags` (which also takes the handle).
 */
import { tagVocabularyService, type FinanceDb } from '../../../db/index.js';
import { suggestTags, type SuggestedTag } from '../tag-suggester/index.js';

/**
 * Load the closed tag vocabulary, most-used value first. Called once per import
 * batch and threaded into the categorizer prompt and `buildSuggestedTags`, so
 * neither re-queries per transaction.
 *
 * Reads `tag_vocabulary` and nothing else (POPS-2606). It used to union in
 * every distinct tag on a stored transaction, and that union was a ratchet: a
 * value the model coined survived one commit and came back as vocabulary in the
 * next prompt, with the same standing as a deliberate one. The vocabulary is
 * now the only thing that confers standing.
 *
 * Restricted to `closed` because these are the values the model is permitted to
 * write. `open` values are a human's to add and `marker` values are the
 * system's to derive; putting either in front of the categorizer would invite
 * exactly the guess the closed sets exist to prevent.
 */
export function loadKnownTags(db: FinanceDb): string[] {
  return tagVocabularyService.listVocabularyTagsByKind(db, 'closed');
}

export interface BuildSuggestedTagsOptions {
  description: string;
  entityId: string | null;
  correctionTags: string[];
  aiTags?: string[];
  aiCategory: string | null;
  knownTags: string[];
  correctionPattern?: string;
  /** `contactId → defaultTags` from the per-run contacts fetch (entity source). */
  entityDefaultTags?: ReadonlyMap<string, string[]>;
  /**
   * Forwarded to `suggestTags`'s `recordTagRuleUsage`. Defaults to `true` —
   * pass `false` when the caller is building suggestions for an in-memory
   * preview rather than a real classification pass.
   */
  recordTagRuleUsage?: boolean;
  /** Forwarded to `suggestTags`'s `onTagRulesMatched`. */
  onTagRulesMatched?: (ruleIds: readonly string[]) => void;
}

/**
 * Build the suggested tags for a single transaction with source attribution
 * (rule > ai > entity). Thin pass-through to the pillar's `suggestTags`.
 */
export function buildSuggestedTags(db: FinanceDb, opts: BuildSuggestedTagsOptions): SuggestedTag[] {
  return suggestTags(db, {
    description: opts.description,
    entityId: opts.entityId,
    aiTags: opts.aiTags,
    aiCategory: opts.aiCategory,
    knownTags: opts.knownTags,
    correctionTags: opts.correctionTags,
    correctionPattern: opts.correctionPattern,
    entityDefaultTags: opts.entityDefaultTags,
    recordTagRuleUsage: opts.recordTagRuleUsage,
    onTagRulesMatched: opts.onTagRulesMatched,
  });
}
