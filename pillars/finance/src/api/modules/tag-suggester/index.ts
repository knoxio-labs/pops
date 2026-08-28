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
  transactionCorrectionsService,
  transactionTagRulesService,
} from '../../../db/index.js';
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
}

function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
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
  db: FinanceDb;
  description: string;
  entityId: string | null;
  entityDefaultTags: ReadonlyMap<string, string[]>;
  recordTagRuleUsage: boolean;
  onTagRulesMatched: ((ruleIds: readonly string[]) => void) | undefined;
  tagRules: readonly InMemoryTagRule[] | undefined;
  seen: Set<string>;
  result: SuggestedTag[];
}

function addCorrectionTags(
  pass: TagPass,
  correctionTags: string[] | undefined,
  correctionPattern: string | undefined
): void {
  const { db, description, seen, result } = pass;
  if (correctionTags && correctionTags.length > 0) {
    for (const tag of correctionTags) {
      if (!remember(seen, tag)) continue;
      result.push({ tag, source: 'rule', pattern: correctionPattern });
    }
    return;
  }
  for (const correction of transactionCorrectionsService.findAllMatchingTransactionCorrections(
    db,
    description
  )) {
    for (const tag of parseTags(correction.tags)) {
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
    pushRuleTags(pass, parseTags(rule.tags), rule.descriptionPattern);
  }
}

interface AddAiTagsArgs {
  aiTags: string[] | undefined;
  aiCategory: string | null | undefined;
  knownTags: string[] | undefined;
  /**
   * The whole active vocabulary, which is what `isNew` is answered against.
   * Deliberately not `knownTags`: that list is the *closed* vocabulary the
   * model was offered, and testing membership against it reported every open
   * value — a `trip:` or `asset:` the user had already created — as new
   * (POPS-2602).
   */
  knownTagSet: tagVocabularyService.KnownTagSet;
  seen: Set<string>;
  result: SuggestedTag[];
}

function addAiTags(args: AddAiTagsArgs): void {
  const { aiTags, aiCategory, knownTags, knownTagSet, seen, result } = args;
  let tags: string[];
  if (aiTags && aiTags.length > 0) {
    tags = aiTags;
  } else if (aiCategory && knownTags) {
    const matched = knownTags.find((t) => t.toLowerCase() === aiCategory.toLowerCase());
    tags = matched ? [matched] : [];
  } else {
    return;
  }
  for (const tag of tags) {
    if (!remember(seen, tag)) continue;
    const isNew = !knownTagSet.has(tag) || undefined;
    result.push({ tag, source: 'ai', ...(isNew ? { isNew: true } : {}) });
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
    entityId: opts.entityId,
    entityDefaultTags: opts.entityDefaultTags ?? new Map(),
    recordTagRuleUsage: opts.recordTagRuleUsage ?? true,
    onTagRulesMatched: opts.onTagRulesMatched,
    tagRules: opts.tagRules,
    seen: new Set<string>(),
    result: [],
  };
  addCorrectionTags(pass, opts.correctionTags, opts.correctionPattern);
  addTagRuleTags(pass);
  addAiTags({
    aiTags: opts.aiTags,
    aiCategory: opts.aiCategory,
    knownTags: opts.knownTags,
    knownTagSet: tagVocabularyService.loadKnownTagSet(db),
    seen: pass.seen,
    result: pass.result,
  });
  addEntityTags(pass);
  return pass.result;
}
