/**
 * Deterministic suggestion-impact preview for a tag-rule ChangeSet.
 *
 * Suggestion-only: rules never override user-entered tags, and the
 * computation reads nothing but the supplied transactions plus the user
 * vocabulary.
 *
 * The match test is `patternMatchesNormalizedDescription`, the same predicate
 * `findMatchingTagRules` runs on the live path (POPS-2600) — this preview used
 * to have its own copy, so it could claim a rule matched something production
 * would skip. It normalises both the description and the (not-yet-persisted)
 * candidate pattern, mirroring what `createTransactionTagRule` stores. A naive
 * `toUpperCase()`-only preview would diverge from production for any
 * digit-bearing description (most real bank text) (CF022).
 */
import {
  type FinanceDb,
  tagVocabularyService,
  transactionCorrectionsService,
} from '../../../db/index.js';

import type { TagRuleChangeSet } from '../../../contract/rest-tag-rules.js';
import type {
  PreviewInputTransaction,
  TagRuleImpactCounts,
  TagRuleImpactItem,
  TagSuggestion,
} from './types.js';

const { normalizeDescription, patternMatchesNormalizedDescription } = transactionCorrectionsService;

interface ProposedRule {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
}

function materializeProposedRules(changeSet: TagRuleChangeSet): ProposedRule[] {
  const rules: ProposedRule[] = [];
  for (const op of changeSet.ops) {
    if (op.op === 'add') {
      rules.push({
        descriptionPattern: op.data.descriptionPattern,
        matchType: op.data.matchType,
        entityId: op.data.entityId ?? null,
        tags: op.data.tags,
      });
    }
  }
  return rules;
}

function suggestFromRules(
  description: string,
  entityId: string | null,
  rules: ProposedRule[],
  vocabulary: Set<string>
): TagSuggestion[] {
  const normalized = normalizeDescription(description);
  const seen = new Set<string>();
  const out: TagSuggestion[] = [];

  for (const rule of rules) {
    if (rule.entityId && rule.entityId !== entityId) continue;
    if (!patternMatchesNormalizedDescription(rule.descriptionPattern, rule.matchType, normalized))
      continue;

    for (const tag of rule.tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push({
        tag,
        source: 'tag_rule',
        pattern: rule.descriptionPattern,
        isNew: !vocabulary.has(tag.toLowerCase()),
      });
    }
  }
  return out;
}

export function previewTagRuleChangeSet(
  db: FinanceDb,
  args: {
    changeSet: TagRuleChangeSet;
    transactions: PreviewInputTransaction[];
    maxPreviewItems: number;
  }
): { counts: TagRuleImpactCounts; affected: TagRuleImpactItem[] } {
  const txs = args.transactions.slice(0, args.maxPreviewItems);
  const vocabulary = new Set(
    tagVocabularyService.listVocabularyTags(db).map((t) => t.toLowerCase())
  );
  const proposedRules = materializeProposedRules(args.changeSet);

  const affected: TagRuleImpactItem[] = [];
  for (const t of txs) {
    if (t.userTags && t.userTags.length > 0) continue;

    const after = suggestFromRules(t.description, t.entityId ?? null, proposedRules, vocabulary);
    const before: TagSuggestion[] = [];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      affected.push({
        transactionId: t.transactionId,
        description: t.description,
        before: { suggestedTags: before },
        after: { suggestedTags: after },
      });
    }
  }

  const newTagProposals = affected
    .flatMap((a) => a.after.suggestedTags)
    .filter((t) => t.isNew).length;

  return {
    counts: { affected: affected.length, suggestionChanges: affected.length, newTagProposals },
    affected,
  };
}
