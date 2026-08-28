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

function addTagRuleTags(pass: TagPass): void {
  const { db, description, entityId, recordTagRuleUsage, tagRules } = pass;
  if (tagRules) {
    for (const rule of matchTagRules(tagRules, description, entityId)) {
      pushRuleTags(pass, rule.tags, rule.descriptionPattern);
    }
    return;
  }
  for (const rule of findMatchingTagRules(db, description, entityId)) {
    if (recordTagRuleUsage) {
      transactionTagRulesService.incrementTransactionTagRuleUsage(db, rule.id);
    }
    pushRuleTags(pass, parseTags(rule.tags), rule.descriptionPattern);
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

  const knownTagSet = tagVocabularyService.loadKnownTagSet(db);
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
    db,
    seen: pass.seen,
    result: pass.result,
  });
  addEntityTags(pass);
  return pass.result;
}
