/**
 * The `ProcessedTransaction` a matched correction rule produces — one builder
 * for a rule that names a merchant, one for a rule that does not — and the
 * `type` decision both share.
 *
 * Split out of `apply-learned-correction.ts`, which keeps rule matching,
 * outcome bucketing and usage telemetry, so each file stays under the per-file
 * line cap.
 */
import {
  classifyFromDescription,
  FEE_TAG_PREFIX,
} from '../../../contract/transaction-classification.js';
import { type FinanceDb } from '../../../db/index.js';
import { type CorrectionRow, parseCorrectionTags } from '../corrections/index.js';
import { buildSuggestedTags } from './tag-management.js';

import type { TransactionType } from '../../../contract/corrections-constants.js';
import type { FeeTag } from '../../../contract/transaction-classification.js';
import type { CorrectionMatchStatus } from '../corrections/index.js';
import type {
  MatchedRule,
  ParsedTransaction,
  ProcessedTransaction,
  SuggestedTag,
} from './types.js';

/** A rule-matched row's `type`, with the descriptor provenance when it supplied one. */
export interface AppliedType {
  type: TransactionType | undefined;
  /** The single `fee:` value for a descriptor-derived fee; `null` otherwise. */
  feeTag: FeeTag | null;
  /** The descriptor phrase that produced {@link feeTag}. */
  feePattern: string | null;
}

/**
 * The type a rule-matched row carries.
 *
 * A rule's own `transactionType` still wins — that is the explicit instruction
 * the ladder puts above the descriptor stage. But a rule that names only a
 * merchant used to leave the row untyped, which suppressed the descriptor
 * classification the ladder would otherwise have reached: an
 * `INTEREST CHARGED ON PURCHASES` row matched by an entity-only ANZ rule
 * committed as a `purchase` and landed on the expense tile (POPS-2754). Falling
 * back to {@link classifyFromDescription} makes the outcome "the rule says who,
 * the descriptor says what" rather than "the rule says who, so nothing says
 * what".
 */
export function resolveAppliedType(correction: CorrectionRow, description: string): AppliedType {
  if (correction.transactionType) {
    return { type: correction.transactionType, feeTag: null, feePattern: null };
  }
  const derived = classifyFromDescription(description);
  if (!derived) return { type: undefined, feeTag: null, feePattern: null };
  return { type: derived.type, feeTag: derived.tag ?? null, feePattern: derived.pattern };
}

/**
 * The row's suggestions once a descriptor-derived fee kind is known: the derived
 * `fee:` value, then every non-`fee:` suggestion the rule and the tag-suggester
 * produced. Any other `fee:` suggestion is dropped rather than merged, so
 * "which fee" has exactly one answer per row — the same rule
 * `buildDerivedMatch` applies on the descriptor-only path.
 */
export function withDerivedFeeTag(suggested: SuggestedTag[], applied: AppliedType): SuggestedTag[] {
  if (!applied.feeTag) return suggested;
  const feeTag: SuggestedTag = {
    tag: applied.feeTag,
    source: 'rule',
    ...(applied.feePattern ? { pattern: applied.feePattern } : {}),
  };
  return [feeTag, ...suggested.filter((s) => !s.tag.startsWith(FEE_TAG_PREFIX))];
}

export interface TypeOnlyMatchArgs {
  db: FinanceDb;
  transaction: ParsedTransaction;
  correction: CorrectionRow;
  matchedRules: MatchedRule[];
  knownTags: string[];
  status: CorrectionMatchStatus;
  collectTagRules: (ruleIds: readonly string[]) => void;
}

export function buildTypeOnlyMatch(args: TypeOnlyMatchArgs): ProcessedTransaction {
  const { db, transaction, correction, matchedRules, knownTags, status, collectTagRules } = args;
  const applied = resolveAppliedType(correction, transaction.description);
  return {
    ...transaction,
    location: correction.location ?? transaction.location,
    transactionType: applied.type,
    entity: { matchType: 'learned', confidence: correction.confidence },
    ruleProvenance: {
      source: 'correction',
      ruleId: correction.id,
      pattern: correction.descriptionPattern,
      matchType: correction.matchType,
      confidence: correction.confidence,
    },
    matchedRules,
    status,
    suggestedTags: withDerivedFeeTag(
      buildSuggestedTags(db, {
        description: transaction.description,
        entityId: null,
        correctionTags: parseCorrectionTags(correction.tags),
        aiCategory: null,
        knownTags,
        correctionPattern: correction.descriptionPattern,
        recordTagRuleUsage: false,
        onTagRulesMatched: collectTagRules,
      }),
      applied
    ),
  };
}

export interface EntityMatchArgs {
  db: FinanceDb;
  transaction: ParsedTransaction;
  correction: CorrectionRow;
  matchedRules: MatchedRule[];
  status: 'matched' | 'uncertain';
  entityId: string;
  knownTags: string[];
  entityDefaultTags: ReadonlyMap<string, string[]>;
  collectTagRules: (ruleIds: readonly string[]) => void;
}

export function buildEntityMatch(args: EntityMatchArgs): ProcessedTransaction {
  const { db, transaction, correction, matchedRules, status, entityId, knownTags } = args;
  const applied = resolveAppliedType(correction, transaction.description);
  return {
    ...transaction,
    location: correction.location ?? transaction.location,
    transactionType: applied.type,
    entity: {
      entityId,
      entityName: correction.entityName ?? 'Unknown',
      matchType: 'learned',
      confidence: correction.confidence,
    },
    ruleProvenance: {
      source: 'correction',
      ruleId: correction.id,
      pattern: correction.descriptionPattern,
      matchType: correction.matchType,
      confidence: correction.confidence,
    },
    matchedRules,
    status,
    suggestedTags: withDerivedFeeTag(
      buildSuggestedTags(db, {
        description: transaction.description,
        entityId,
        correctionTags: parseCorrectionTags(correction.tags),
        aiCategory: null,
        knownTags,
        correctionPattern: correction.descriptionPattern,
        entityDefaultTags: args.entityDefaultTags,
        recordTagRuleUsage: false,
        onTagRulesMatched: args.collectTagRules,
      }),
      applied
    ),
  };
}
