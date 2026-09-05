/**
 * DB-injected correction-rule ChangeSet application.
 *
 * Ported from the monolith `core/corrections/handlers/apply-corrections.ts`,
 * rewritten to take a `FinanceDb` handle as its first argument and to wrap the
 * whole ChangeSet in a single `db.transaction` so a partial set never lands.
 *
 * `TransactionTagRuleNotFoundError`-style behaviour is preserved: an
 * edit/disable/remove op targeting an unknown id throws `NotFoundError` (→ 404),
 * which inside `db.transaction` rolls the whole set back. An `add` op with no
 * `entityId`, no `transactionType`, and non-empty `tags` throws `ValidationError`
 * (→ 400, CF061/#3650) before anything is written — a tags-only row belongs in
 * `transaction_tag_rules`, not here.
 */
import { and, desc, eq } from 'drizzle-orm';

import { MIN_MATCH_CONFIDENCE } from '../../../contract/corrections-pure.js';
import {
  type FinanceDb,
  transactionCorrections,
  transactionCorrectionsService,
  UnmatchablePatternError,
} from '../../../db/index.js';
import { mergeTagsWithinFacetLimits, parseStoredTags } from '../../../db/tag-facets.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

import type { ChangeSet, ChangeSetOp } from '../../../contract/rest-corrections.js';
import type { CorrectionRow } from './types.js';

const { isTagsOnlyCorrectionInput, isValidRegexPattern, normalizePatternForStorage } =
  transactionCorrectionsService;

/**
 * Reject a ChangeSet `add` whose data carries no `entityId`, no
 * `transactionType`, and non-empty `tags` — a tags-only row that violates the
 * classification-rule/tag-rule table boundary (CF061/#3650). Tag-only intent
 * belongs in a `transaction_tag_rules` ChangeSet, not here.
 */
function assertNotTagsOnly(op: Extract<ChangeSetOp, { op: 'add' }>): void {
  if (isTagsOnlyCorrectionInput(op.data)) {
    throw new ValidationError(
      'A correction rule needs an entityId or a transactionType — tags-only rules belong in transaction_tag_rules'
    );
  }
}

/**
 * Would this `add` op store an `exact`/`contains` pattern that normalises to
 * the empty string — `'1234'`, `'  '` — which `patternMatchesDescription`
 * refuses unconditionally, leaving an active rule nothing can ever fire
 * (POPS-3001)? `transaction_tag_rules` has refused this since POPS-2942;
 * corrections never did.
 */
function normalisesToNothing(op: Extract<ChangeSetOp, { op: 'add' }>): boolean {
  if (op.data.matchType === 'regex') return false;
  return normalizePatternForStorage(op.data.descriptionPattern, op.data.matchType).length === 0;
}

function findExistingCorrectionByKey(
  tx: FinanceDb,
  matchType: Extract<ChangeSetOp, { op: 'add' }>['data']['matchType'],
  normalizedPattern: string
): CorrectionRow | undefined {
  return tx
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, matchType),
        eq(transactionCorrections.descriptionPattern, normalizedPattern)
      )
    )
    .get();
}

/** Why an `add` op can never produce a rule that fires, or `null` if it can. */
function unusableAddOpReason(op: Extract<ChangeSetOp, { op: 'add' }>): string | null {
  if (isTagsOnlyCorrectionInput(op.data)) {
    return 'tags-only rules belong in transaction_tag_rules (CF061/#3650)';
  }
  if (op.data.matchType === 'regex' && !isValidRegexPattern(op.data.descriptionPattern)) {
    return 'the regex pattern does not compile, so no matcher could ever fire it (POPS-2600)';
  }
  if (normalisesToNothing(op)) {
    return 'the pattern normalises to the empty string, which never matches a description (POPS-3001)';
  }
  return null;
}

/**
 * Drop any `add` op that could only ever produce a rule that never fires —
 * tags-only (CF061/#3650), an uncompilable `regex` pattern (POPS-2600) or a
 * pattern that normalises to nothing (POPS-3001) — logging a warning for each
 * one dropped.
 *
 * Used by the import-commit path (`imports/commit.ts`), which bundles the
 * ChangeSet apply together with entity creation and every transaction insert
 * in one `db.transaction` — letting `applyAddOp` throw on a single stray op
 * would roll back the entire commit over one inert rule. The correction
 * detail editor takes a free-text pattern next to a `regex` option and runs
 * no client-side compile check, so an uncompilable pattern reaching commit is
 * an ordinary typo, not a malformed payload; losing a whole import to it
 * would be far worse than losing the rule.
 *
 * The standalone `corrections.applyChangeSet` REST endpoint is unaffected: it
 * still rejects every one of those shapes outright, since nothing is at stake
 * there but the rule set itself.
 */
export function dropUnusableAddOps(changeSet: ChangeSet): ChangeSet {
  const ops = changeSet.ops.filter((op) => {
    if (op.op !== 'add') return true;
    const reason = unusableAddOpReason(op);
    if (reason === null) return true;
    console.warn(
      `[Corrections] Dropping add op (descriptionPattern="${op.data.descriptionPattern}") from a commit ChangeSet — ${reason}`
    );
    return false;
  });
  return { ...changeSet, ops };
}

/**
 * Reject a ChangeSet `add` whose `regex` pattern doesn't compile. Every matcher
 * silently skips an uncompilable pattern, so storing one leaves a rule that
 * looks active and can never fire (POPS-2600).
 */
function assertPatternCompiles(op: Extract<ChangeSetOp, { op: 'add' }>): void {
  if (op.data.matchType === 'regex' && !isValidRegexPattern(op.data.descriptionPattern)) {
    throw new ValidationError(
      `Pattern is not a valid regular expression: ${op.data.descriptionPattern}`
    );
  }
}

/** Whether an `add` op minted a new correction or landed on one that already existed. */
export type CorrectionAddOutcome = 'inserted' | 'reinforced';

type AddOp = Extract<ChangeSetOp, { op: 'add' }>;

/**
 * Merge `op.data.tags` into `existingTags` via {@link mergeTagsWithinFacetLimits}
 * (POPS-2954, the same defect POPS-2755 fixed one table over on
 * `transaction_tag_rules`) and log a warning for every incoming tag a
 * single-valued facet already occupied refused.
 */
function mergeAddOpTags(existingTags: string[], op: AddOp, existingId: string): string[] {
  const { tags, dropped } = mergeTagsWithinFacetLimits(existingTags, op.data.tags ?? []);
  for (const tag of dropped) {
    console.warn(
      `[Corrections] Not adding ${JSON.stringify(tag)} to rule ${existingId}: ` +
        `the rule already carries a value on that single-valued facet`
    );
  }
  return tags;
}

/**
 * Reinforce a correction hit on the `(normalized descriptionPattern,
 * matchType)` key: `tags` merged (see {@link mergeAddOpTags}), the
 * classification fields (`entityId`, `entityName`, `location`,
 * `transactionType`) replaced wholesale — unlike tags, every add op decides
 * a rule's classification on purpose. An `add` asserts a complete
 * classification for the pattern, not an incremental one: a rule fired
 * against the wrong entity is fixed by adding a corrected classification for
 * the same pattern, and that correction should win outright, the way a tag
 * never should evict one an earlier add already asserted. `entityId` is the
 * operative field and `entityName` only its display label; the two are
 * always written together (the standing invariant from POPS-2848), which is
 * why both come from the same op rather than one persisting while the other
 * resets.
 */
function reinforceExistingCorrectionRule(tx: FinanceDb, existing: CorrectionRow, op: AddOp): void {
  const tags = mergeAddOpTags(parseStoredTags(existing.tags), op, existing.id);
  tx.update(transactionCorrections)
    .set({
      entityId: op.data.entityId ?? null,
      entityName: op.data.entityName ?? null,
      location: op.data.location ?? null,
      tags: JSON.stringify(tags),
      transactionType: op.data.transactionType ?? null,
      isActive: op.data.isActive ?? true,
      confidence: op.data.confidence ?? MIN_MATCH_CONFIDENCE,
      priority: op.data.priority ?? 0,
    })
    .where(eq(transactionCorrections.id, existing.id))
    .run();
}

function insertNewCorrectionRule(tx: FinanceDb, normalized: string, op: AddOp): void {
  tx.insert(transactionCorrections)
    .values({
      descriptionPattern: normalized,
      matchType: op.data.matchType,
      entityId: op.data.entityId ?? null,
      entityName: op.data.entityName ?? null,
      location: op.data.location ?? null,
      tags: JSON.stringify(op.data.tags ?? []),
      transactionType: op.data.transactionType ?? null,
      isActive: op.data.isActive ?? true,
      confidence: op.data.confidence ?? MIN_MATCH_CONFIDENCE,
      priority: op.data.priority ?? 0,
    })
    .run();
}

/**
 * Add a correction rule, upserting on the `(normalized descriptionPattern,
 * matchType)` key instead of a raw insert (CF035): two `add` ops for the same
 * pattern in one ChangeSet — or across ChangeSets in the same commit — land
 * on the same row (the second becomes an update) instead of forking a
 * duplicate where only one of the two ever matches. See
 * {@link reinforceExistingCorrectionRule} for what a hit does to `tags`
 * versus the classification fields.
 */
function applyAddOp(tx: FinanceDb, op: AddOp): CorrectionAddOutcome {
  assertNotTagsOnly(op);
  assertPatternCompiles(op);
  if (normalisesToNothing(op)) {
    const unmatchable = new UnmatchablePatternError(op.data.descriptionPattern);
    throw new ValidationError(unmatchable.pattern, unmatchable.message);
  }

  const normalized = normalizePatternForStorage(op.data.descriptionPattern, op.data.matchType);
  const existing = findExistingCorrectionByKey(tx, op.data.matchType, normalized);

  if (existing) {
    reinforceExistingCorrectionRule(tx, existing, op);
    return 'reinforced';
  }

  insertNewCorrectionRule(tx, normalized, op);
  return 'inserted';
}

function buildEditUpdates(
  op: Extract<ChangeSetOp, { op: 'edit' }>
): Partial<typeof transactionCorrections.$inferInsert> {
  const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
  if (op.data.entityId !== undefined) updates.entityId = op.data.entityId;
  if (op.data.entityName !== undefined) updates.entityName = op.data.entityName;
  if (op.data.location !== undefined) updates.location = op.data.location;
  if (op.data.tags !== undefined) updates.tags = JSON.stringify(op.data.tags);
  if (op.data.transactionType !== undefined) updates.transactionType = op.data.transactionType;
  if (op.data.isActive !== undefined) updates.isActive = op.data.isActive;
  if (op.data.confidence !== undefined) updates.confidence = op.data.confidence;
  if (op.data.priority !== undefined) updates.priority = op.data.priority;
  return updates;
}

function applyMutatingOp(tx: FinanceDb, op: Exclude<ChangeSetOp, { op: 'add' }>): void {
  const existing = tx
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, op.id))
    .get();
  if (!existing) throw new NotFoundError('Correction', op.id);

  if (op.op === 'edit') {
    tx.update(transactionCorrections)
      .set(buildEditUpdates(op))
      .where(eq(transactionCorrections.id, op.id))
      .run();
    return;
  }
  if (op.op === 'disable') {
    tx.update(transactionCorrections)
      .set({ isActive: false })
      .where(eq(transactionCorrections.id, op.id))
      .run();
    return;
  }
  tx.delete(transactionCorrections).where(eq(transactionCorrections.id, op.id)).run();
}

/** Created-vs-reinforced split for a ChangeSet's `add` ops (POPS-2954). */
export interface CorrectionRuleWriteCounts {
  inserted: number;
  reinforced: number;
}

/** Result of applying a correction ChangeSet: the full rule set, and what the `add` ops did. */
export interface ApplyChangeSetResult {
  rows: CorrectionRow[];
  writes: CorrectionRuleWriteCounts;
}

/**
 * Apply a ChangeSet atomically and return the full rule set ordered by
 * `confidence DESC, timesApplied DESC`, plus how many `add` ops created a
 * rule against how many merged into one that already existed. Ops run in a
 * fixed order (add → edit → disable → remove).
 */
export function applyChangeSet(db: FinanceDb, changeSet: ChangeSet): ApplyChangeSetResult {
  return db.transaction((tx) => {
    const order: Record<ChangeSetOp['op'], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
    const ops = [...changeSet.ops].toSorted((a, b) => order[a.op] - order[b.op]);

    const writes: CorrectionRuleWriteCounts = { inserted: 0, reinforced: 0 };
    for (const op of ops) {
      if (op.op === 'add') {
        const outcome = applyAddOp(tx, op);
        if (outcome === 'inserted') writes.inserted++;
        else writes.reinforced++;
      } else {
        applyMutatingOp(tx, op);
      }
    }

    const rows = tx
      .select()
      .from(transactionCorrections)
      .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
      .all();
    return { rows, writes };
  });
}
