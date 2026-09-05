/**
 * Suggest tags for a transaction with source attribution.
 *
 * Strategy (order = priority for dedup):
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
  tagVocabularyService,
  type FinanceDb,
  type TransactionCorrectionRow,
  transactionCorrectionsService,
  transactionTagRulesService,
} from '../../../db/index.js';
import { parseStoredTags } from '../../../db/tag-facets.js';
import { findMatchingTagRules, matchTagRules } from './tag-rule-matching.js';

import type { InMemoryTagRule } from './tag-rule-matching.js';

export type TagSuggestionSource = 'rule' | 'ai' | 'entity';

export interface SuggestedTag {
  tag: string;
  source: TagSuggestionSource;
  pattern?: string;
  isNew?: boolean;
}

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

/**
 * Record a tag as emitted, returning false when an equal tag is already in the
 * result. Comparison is case-insensitive and shared with the vocabulary, so an
 * AI `Bar` and an entity-default `bar` collapse to one suggestion instead of
 * landing on the row twice under two spellings.
 */
function remember(seen: Set<string>, tag: string): boolean {
  const key = tagVocabularyService.normalizeTagForComparison(tag);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
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
      if (!remember(seen, tag)) continue;
      result.push({ tag, source: 'rule', pattern: correctionPattern });
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
      if (!remember(seen, tag)) continue;
      result.push({ tag, source: 'rule', pattern: correction.descriptionPattern ?? undefined });
    }
  }
}

function pushRuleTags(pass: TagPass, tags: string[], pattern: string): void {
  for (const tag of tags) {
    if (!remember(pass.seen, tag)) continue;
    pass.result.push({ tag, source: 'rule', pattern });
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
      pushRuleTags(pass, rule.tags, rule.descriptionPattern);
    }
    return;
  }
  const matching = findMatchingTagRules(db, description, entityId);
  const matchedIds = matching.map((rule) => rule.id);
  pass.onTagRulesMatched?.(matchedIds);
  if (recordTagRuleUsage) creditTagRuleUsage(db, matchedIds);
  for (const rule of matching) {
    pushRuleTags(pass, parseStoredTags(rule.tags), rule.descriptionPattern);
  }
}

interface AddAiTagsArgs {
  aiTags: string[] | undefined;
  aiCategory: string | null | undefined;
  knownTags: string[] | undefined;
  db: FinanceDb;
  seen: Set<string>;
  result: SuggestedTag[];
}

/**
 * Attribute model-supplied tags as `source: 'ai'` suggestions, flagging any
 * value outside the active vocabulary as `isNew` so the accept/reject gate can
 * tell a vocabulary value from a coined one.
 *
 * Exported because the tag-only pass (POPS-2596) attributes its tags without a
 * full `suggestTags` walk: those rows resolved deterministically and already
 * ran the correction/rule passes, and re-running them would bump `timesApplied`
 * a second time for rules whose tags the row does not even carry. It takes the
 * vocabulary set rather than reading it so that pass can load it once per run
 * instead of once per row.
 */
export function buildAiSuggestedTags(
  aiTags: readonly string[],
  knownTagSet: tagVocabularyService.KnownTagSet
): SuggestedTag[] {
  const seen = new Set<string>();
  const result: SuggestedTag[] = [];
  for (const tag of aiTags) {
    if (!remember(seen, tag)) continue;
    const isNew = !knownTagSet.has(tag) || undefined;
    result.push({ tag, source: 'ai', ...(isNew ? { isNew: true } : {}) });
  }
  return result;
}

/**
 * The AI pass, and the only pass that answers `isNew`.
 *
 * The vocabulary read happens after the early return, not before it: this pass
 * contributes nothing to a row the model did not classify, and reading the
 * table to then discard it made every deterministic row — and both sides of
 * every `previewTagRuleChangeSet` diff — pay for a set nothing consumed.
 *
 * It is read here rather than threaded from the caller because the answer must
 * come from the whole active vocabulary, and the once-per-batch list the caller
 * carries (`knownTags`) is the *closed* vocabulary the prompt was built from —
 * testing membership against that reported every open value the user had
 * already created as new (POPS-2602). What remains is one indexed read per
 * AI-classified row, on a path already waiting on a model call.
 */
function addAiTags(args: AddAiTagsArgs): void {
  const { aiTags, aiCategory, knownTags, db, seen, result } = args;
  let tags: string[];
  if (aiTags && aiTags.length > 0) {
    tags = aiTags;
  } else if (aiCategory && knownTags) {
    const matched = knownTags.find((t) => t.toLowerCase() === aiCategory.toLowerCase());
    tags = matched ? [matched] : [];
  } else {
    return;
  }
  if (tags.length === 0) return;

  for (const suggestion of buildAiSuggestedTags(tags, tagVocabularyService.loadKnownTagSet(db))) {
    if (!remember(seen, suggestion.tag)) continue;
    result.push(suggestion);
  }
}

function addEntityTags(pass: TagPass): void {
  const { entityId, entityDefaultTags, seen, result } = pass;
  if (!entityId) return;
  const tags = entityDefaultTags.get(entityId);
  if (!tags) return;
  for (const tag of tags) {
    if (!remember(seen, tag)) continue;
    result.push({ tag, source: 'entity' });
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
    knownTags: opts.knownTags,
    db,
    seen: pass.seen,
    result: pass.result,
  });
  addEntityTags(pass);
  return pass.result;
}
