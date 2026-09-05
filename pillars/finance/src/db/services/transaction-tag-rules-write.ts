/**
 * The create-or-reinforce write path for `transaction_tag_rules`.
 *
 * Split out of `transaction-tag-rules.ts` so that file stays under the
 * per-file line cap. The identity key and the merge semantics are documented
 * on the functions below; the read/list/patch/delete half stays in the parent
 * module, which re-exports these.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { InvalidPatternError, UnmatchablePatternError } from '../errors.js';
import { transactionTagRules } from '../schema.js';
import { mergeTagsWithinFacetLimits, parseStoredTags } from '../tag-facets.js';
import {
  isValidRegexPattern,
  normalizePatternForStorage,
} from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';
import type {
  CreateTransactionTagRuleInput,
  TagRuleMatchType,
  TransactionTagRuleRow,
} from './transaction-tag-rules-types.js';

/**
 * The `(matchType, normalized descriptionPattern, entityId)` identity-key
 * lookup {@link createOrReinforceTransactionTagRule} resolves an `add` op
 * against. Exported so a caller that only needs to know *whether* an op
 * would collide — Final Review's collision preview (POPS-2955) — can ask the
 * same question the write path asks, rather than growing a second copy of
 * the key that can drift from this one.
 */
export function findExistingTagRule(
  db: FinanceDb,
  matchType: TagRuleMatchType,
  normalizedPattern: string,
  entityId: string | null
): TransactionTagRuleRow | undefined {
  return db
    .select()
    .from(transactionTagRules)
    .where(
      and(
        eq(transactionTagRules.matchType, matchType),
        eq(transactionTagRules.descriptionPattern, normalizedPattern),
        entityId === null
          ? isNull(transactionTagRules.entityId)
          : eq(transactionTagRules.entityId, entityId)
      )
    )
    .get();
}

/**
 * Reinforce an existing tag rule hit on the `(normalizedPattern, matchType,
 * entityId)` key: confidence bumped by 0.1 (capped at 1.0), `isActive` reset
 * to true, `input.tags` **merged into** the rule's existing tags. `priority`
 * is overlaid only when the input supplies one — mirrors
 * `reinforceExistingCorrection`.
 *
 * Merged, not overwritten (POPS-2755). The key collapse above exists so that
 * `'K Mart'` and `'k mart 42'` are recognised as the same rule (CF022); it
 * says nothing about whose tag list is authoritative, and replacing the tags
 * wholesale was the part of that collapse never argued for. An `add` op
 * asserts that its tags belong — it carries no assertion that the tags absent
 * from it do not, and the caller (an import batch) has no way to know what the
 * rule already says. Under the old behaviour an import silently rewrote the
 * tags of rules it did not create, and only escaped notice because that
 * batch's tags happened to be a superset.
 *
 * Deliberate replacement is still available and still explicit: it is what
 * {@link updateTransactionTagRule} is for, reached by an `edit` op naming the
 * rule id the user picked.
 *
 * `timesApplied` and `lastUsedAt` are deliberately untouched: re-creating a
 * rule is not a use of it. Those two belong exclusively to
 * {@link incrementTransactionTagRuleUsage}, called from the matcher, so
 * `timesApplied` stays readable as usage evidence (POPS-2597/POPS-254).
 */
function reinforceExistingTagRule(
  db: FinanceDb,
  existing: TransactionTagRuleRow,
  input: CreateTransactionTagRuleInput
): TransactionTagRuleRow {
  const { tags, dropped } = mergeTagsWithinFacetLimits(parseStoredTags(existing.tags), input.tags);
  for (const tag of dropped) {
    console.warn(
      `[tag-rules] not adding ${JSON.stringify(tag)} to rule ${existing.id}: ` +
        `the rule already carries a value on that single-valued facet`
    );
  }
  return db
    .update(transactionTagRules)
    .set({
      confidence: Math.min(existing.confidence + 0.1, 1.0),
      tags: JSON.stringify(tags),
      priority: input.priority ?? existing.priority,
      isActive: true,
    })
    .where(eq(transactionTagRules.id, existing.id))
    .returning()
    .get();
}

/** Whether a create-or-reinforce call minted a new rule or landed on one. */
export type TagRuleWriteOutcome = 'inserted' | 'reinforced';

/** What {@link createOrReinforceTransactionTagRule} did, and to what. */
export interface TagRuleWriteResult {
  outcome: TagRuleWriteOutcome;
  row: TransactionTagRuleRow;
  /**
   * The rule's tags before the write. Empty for an `inserted` row; for a
   * `reinforced` one this is what the rule already asserted, so a caller can
   * report the before/after pair rather than describing a merge as a create.
   */
  previousTags: string[];
}

/**
 * Create-or-reinforce a tag rule keyed on `(normalized descriptionPattern,
 * matchType, entityId)` — mirrors `createOrUpdateTransactionCorrection` so a
 * case/digit variant of an already-known pattern (e.g. `'K Mart'` vs
 * `'k mart 42'`) reinforces the existing row instead of forking a duplicate
 * that then never matches under `matchType: 'exact'` (CF022). `entityId` is
 * part of the key (unlike corrections, which has no entity-scoping concept)
 * so two rules deliberately scoped to different entities never collapse into
 * one.
 *
 * `tags` is JSON-encoded before insert. Insert defaults: `confidence=0.95`,
 * `isActive=true`, `priority=0`, `timesApplied=0`. The generated `id` is a
 * UUID from drizzle's `$defaultFn`.
 *
 * `descriptionPattern` is normalized (uppercased, digit-stripped,
 * whitespace-collapsed) for `exact`/`contains` patterns, which are matched
 * against a normalized description and need the same treatment to line up.
 * A `regex` pattern is stored raw: `normalizeDescription` uppercases every
 * character including metacharacters (`\d` -> `\D`, `\s` -> `\S`), which
 * would silently corrupt the pattern. An uncompilable `regex` pattern throws
 * `InvalidPatternError` (-> 400) instead of being stored as a rule that can
 * never fire (POPS-2600). An `exact`/`contains` pattern that normalises to
 * the empty string throws `UnmatchablePatternError` (-> 400) for the same
 * reason (POPS-2942) — see that error's docstring for why this guard stops
 * there and does not also refuse a pattern that merely matches zero rows in
 * today's ledger.
 */
export function createTransactionTagRule(
  db: FinanceDb,
  input: CreateTransactionTagRuleInput
): TransactionTagRuleRow {
  return createOrReinforceTransactionTagRule(db, input).row;
}

/**
 * {@link createTransactionTagRule}, but saying which of the two things it did.
 *
 * The plain function cannot: both branches return a row, and an insert and a
 * reinforcement are indistinguishable in it. That is why an import commit
 * counted every `add` op as a rule created, and reported a merge into somebody
 * else's curated rule as an add (POPS-2755). Callers that report to a user
 * should use this one.
 */
export function createOrReinforceTransactionTagRule(
  db: FinanceDb,
  input: CreateTransactionTagRuleInput
): TagRuleWriteResult {
  if (input.matchType === 'regex' && !isValidRegexPattern(input.descriptionPattern)) {
    throw new InvalidPatternError(input.descriptionPattern);
  }
  const normalized = normalizePatternForStorage(input.descriptionPattern, input.matchType);
  if (input.matchType !== 'regex' && normalized.length === 0) {
    throw new UnmatchablePatternError(input.descriptionPattern);
  }
  const entityId = input.entityId ?? null;

  const existing = findExistingTagRule(db, input.matchType, normalized, entityId);
  if (existing) {
    return {
      outcome: 'reinforced',
      row: reinforceExistingTagRule(db, existing, input),
      previousTags: parseStoredTags(existing.tags),
    };
  }

  const row = db
    .insert(transactionTagRules)
    .values({
      descriptionPattern: normalized,
      matchType: input.matchType,
      entityId,
      tags: JSON.stringify(input.tags),
      confidence: input.confidence ?? 0.95,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
      timesApplied: 0,
    })
    .returning()
    .get();

  return { outcome: 'inserted', row, previousTags: [] };
}
