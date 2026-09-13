/**
 * Suggest tags for a transaction with source attribution.
 *
 * Strategy (order = priority for dedup and for single-valued facets, where the
 * first pass to fill the facet keeps it):
 *   1. Correction rules — tags from matching `transaction_corrections` (source: "rule")
 *   2. Tag rules — tags from `transaction_tag_rules` (source: "rule")
 *   3. AI tags — returned directly by AI or a validated category string (source: "ai")
 *   4. Entity defaults — the contact's `defaultTags`, supplied by the caller
 *      from the live contacts fetch (source: "entity")
 *
 * The rule/correction sources read finance-db tables via the injected
 * `FinanceDb` handle. The entity-default tags come from `entityDefaultTags`, a
 * `contactId → tags` map the caller builds from the contacts pillar.
 *
 * Dedup is case-insensitive, on the same normalisation the vocabulary uses: an
 * AI `Bar` and an entity-default `bar` are one tag, not two rows on the same
 * transaction (POPS-2602).
 */
import {
  type FinanceDb,
  type TransactionCorrectionRow,
  transactionCorrectionsService,
  transactionTagRulesService,
} from '../../../db/index.js';
import { parseStoredTags } from '../../../db/tag-facets.js';
import { addAiTags } from './ai-tags.js';
import { pushSuggestion } from './seen-tags.js';
import { findMatchingTagRules, matchTagRules } from './tag-rule-matching.js';

import type { SuggestedTag } from './types.js';

export { buildAiSuggestedTags } from './ai-tags.js';
export type { SuggestedTag, TagSuggestionSource } from './types.js';

import type { InMemoryTagRule } from './tag-rule-matching.js';

export interface SuggestTagsOptions {
  description: string;
  entityId: string | null;
  /**
   * Account the transaction belongs to, so the correction pass narrows to the
   * same account scope the classifier used (POPS-2593). `null` — a caller with
   * no account in hand — sees every rule, scoped or not.
   *
   * Optional, defaulting to `null`, only because a tag suggestion is advisory:
   * an over-broad suggestion offers a tag the operator can decline, unlike the
   * classifier, where the same slip silently stamps the wrong merchant.
   */
  accountId?: string | null;
  aiTags?: string[];
  aiCategory?: string | null;
  /** The prompt revision that produced `aiTags`, stamped onto each AI suggestion (POPS-3677). */
  aiPromptVersion?: string;
  knownTags?: string[];
  correctionTags?: string[];
  correctionPattern?: string;
  /**
   * `contactId → defaultTags`, sourced from the live contacts fetch by the
   * caller. Absent/empty ⇒ the entity-default tag stage contributes nothing.
   */
  entityDefaultTags?: ReadonlyMap<string, string[]>;
  /**
   * Whether a matching tag rule's `timesApplied`/`lastUsedAt` should be
   * bumped. Defaults to `true` — callers computing suggestions for a
   * read-only lookup (the `GET /suggest-tags` endpoint) or an in-memory
   * preview (`reevaluateWithPendingRules`) must pass `false` so a lookup
   * never counts as usage of the persisted rule.
   */
  recordTagRuleUsage?: boolean;
  /**
   * Called with the ids of the persisted tag rules that matched, before any
   * usage is credited. For a caller that must defer the credit decision until
   * it has the outcome (POPS-2641) — it pairs `recordTagRuleUsage: false` with
   * this and calls `creditTagRuleUsage` itself. Not called for an injected
   * `tagRules` set: those are not the persisted rows.
   */
  onTagRulesMatched?: (ruleIds: readonly string[]) => void;
  /**
   * Match this in-memory rule set instead of querying `transaction_tag_rules`
   * — the ChangeSet preview's merged set (POPS-2599), which carries rules the
   * table does not hold yet and omits ones a `remove` op would drop. Matching,
   * ordering and dedup are the live path's; only the source of the rules
   * differs, which is what keeps a preview from drifting from the import
   * pipeline. Injected rules never bump usage telemetry: some of them are not
   * persisted, and a preview is not a use.
   */
  tagRules?: readonly InMemoryTagRule[];
  /**
   * Match this already-fetched active-correction set instead of querying
   * `transaction_corrections` — the same fetch-once-per-run shape `tagRules`
   * uses, and the one `applyLearnedCorrection`'s `rules` argument already
   * established for corrections (CF040/#3664). A caller matching many
   * descriptions per run (the tag-rule ChangeSet preview, which runs this
   * pass twice per row) fetches the set once with
   * `transactionCorrectionsService.listActiveTransactionCorrectionsForMatching`
   * and threads it through every call instead of re-issuing the same SELECT
   * per call (POPS-2634). Ignored when `correctionTags` is supplied — that
   * option already skips matching entirely.
   */
  corrections?: readonly TransactionCorrectionRow[];
}

interface TagPass {
  accountId: string | null;
  db: FinanceDb;
  description: string;
  entityId: string | null;
  entityDefaultTags: ReadonlyMap<string, string[]>;
  recordTagRuleUsage: boolean;
  onTagRulesMatched: ((ruleIds: readonly string[]) => void) | undefined;
  tagRules: readonly InMemoryTagRule[] | undefined;
  corrections: readonly TransactionCorrectionRow[] | undefined;
  seen: Set<string>;
  result: SuggestedTag[];
}

function addCorrectionTags(
  pass: TagPass,
  correctionTags: string[] | undefined,
  correctionPattern: string | undefined
): void {
  const { db, description, accountId, corrections, seen, result } = pass;
  if (correctionTags && correctionTags.length > 0) {
    for (const tag of correctionTags) {
      pushSuggestion(seen, result, { tag, source: 'rule', pattern: correctionPattern });
    }
    return;
  }
  const matches = corrections
    ? transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromRows(
        corrections,
        description,
        accountId
      )
    : transactionCorrectionsService.findAllMatchingTransactionCorrections(
        db,
        description,
        accountId
      );
  for (const correction of matches) {
    for (const tag of parseStoredTags(correction.tags)) {
      pushSuggestion(seen, result, {
        tag,
        source: 'rule',
        pattern: correction.descriptionPattern ?? undefined,
      });
    }
  }
}

function pushRuleTags(pass: TagPass, tags: string[], pattern: string, entityScoped: boolean): void {
  for (const tag of tags) {
    pushSuggestion(pass.seen, pass.result, {
      tag,
      source: 'rule',
      pattern,
      ...(entityScoped ? { entityScoped: true } : {}),
    });
  }
}

/**
 * Credit usage to tag rules by id.
 *
 * Exported for the caller that can only tell whether an application counts as
 * a use *after* it has seen the outcome (POPS-2641): it builds the suggestions
 * with `recordTagRuleUsage: false`, collects the matched ids through
 * `onTagRulesMatched`, and credits them here once the outcome is known —
 * without re-running the match.
 */
export function creditTagRuleUsage(db: FinanceDb, ruleIds: readonly string[]): void {
  for (const id of ruleIds) {
    transactionTagRulesService.incrementTransactionTagRuleUsage(db, id);
  }
}

function addTagRuleTags(pass: TagPass): void {
  const { db, description, entityId, recordTagRuleUsage, tagRules } = pass;
  if (tagRules) {
    for (const rule of matchTagRules(tagRules, description, entityId)) {
      pushRuleTags(pass, rule.tags, rule.descriptionPattern, rule.entityId !== null);
    }
    return;
  }
  const matching = findMatchingTagRules(db, description, entityId);
  const matchedIds = matching.map((rule) => rule.id);
  pass.onTagRulesMatched?.(matchedIds);
  if (recordTagRuleUsage) creditTagRuleUsage(db, matchedIds);
  for (const rule of matching) {
    pushRuleTags(pass, parseStoredTags(rule.tags), rule.descriptionPattern, rule.entityId !== null);
  }
}

function addEntityTags(pass: TagPass): void {
  const { entityId, entityDefaultTags, seen, result } = pass;
  if (!entityId) return;
  const tags = entityDefaultTags.get(entityId);
  if (!tags) return;
  for (const tag of tags) {
    pushSuggestion(seen, result, { tag, source: 'entity' });
  }
}

export function suggestTags(db: FinanceDb, opts: SuggestTagsOptions): SuggestedTag[] {
  const pass: TagPass = {
    db,
    description: opts.description,
    accountId: opts.accountId ?? null,
    entityId: opts.entityId,
    entityDefaultTags: opts.entityDefaultTags ?? new Map(),
    recordTagRuleUsage: opts.recordTagRuleUsage ?? true,
    onTagRulesMatched: opts.onTagRulesMatched,
    tagRules: opts.tagRules,
    corrections: opts.corrections,
    seen: new Set<string>(),
    result: [],
  };
  addCorrectionTags(pass, opts.correctionTags, opts.correctionPattern);
  addTagRuleTags(pass);
  addAiTags({
    aiTags: opts.aiTags,
    aiCategory: opts.aiCategory,
    aiPromptVersion: opts.aiPromptVersion,
    knownTags: opts.knownTags,
    db,
    seen: pass.seen,
    result: pass.result,
  });
  addEntityTags(pass);
  return pass.result;
}
