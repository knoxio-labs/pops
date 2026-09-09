/**
 * The per-transaction stages of a re-evaluation run.
 *
 * Split out of `reevaluate.ts`, which owns the run-level orchestration and the
 * two public entry points. The bucket asymmetry documented there lives here:
 * `processRemainingItem` is the full ladder for unmatched rows,
 * `reapplyCorrectionToMatched` the deliberately narrower path for rows that
 * are already matched.
 */
import { type FinanceDb } from '../../../db/index.js';
import {
  findAllMatchingCorrectionFromRules,
  normalizeEntityId,
  type CorrectionRow,
} from '../corrections/index.js';
import { applyLearnedCorrection, correctionOutcomeBucket } from './apply-learned-correction.js';
import { matchEntity } from './entity-matcher.js';
import { transactionChanged } from './reevaluate-diff.js';
import { buildSuggestedTags } from './tag-management.js';

import type { EntityMaps } from '../../../db/index.js';
import type { ProcessedTransaction } from './types.js';

export interface ReevaluateContext {
  db: FinanceDb;
  /** The correction rule set, fetched once per run (CF040/#3664) — never re-queried per transaction. */
  rules: CorrectionRow[];
  /** True when `rules` is merged with un-persisted pending ChangeSets — gates usage telemetry, see `applyLearnedCorrection`. */
  isPreview: boolean;
  knownTags: string[];
  entityLookup: EntityMaps['entityLookup'];
  aliases: EntityMaps['aliasMap'];
  entityDefaultTags: ReadonlyMap<string, string[]>;
}

export interface RemainingItem {
  tx: ProcessedTransaction;
  bucket: 'uncertain' | 'failed';
}

export interface BucketAccumulator {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
}

interface StageResult {
  handled: boolean;
  changed: boolean;
}

function tryApplyCorrectionStage(
  item: RemainingItem,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator
): StageResult {
  const correctionApplied = applyLearnedCorrection(ctx.db, {
    transaction: item.tx,
    knownTags: ctx.knownTags,
    rules: ctx.rules,
    isPreview: ctx.isPreview,
    entityDefaultTags: ctx.entityDefaultTags,
    countsAsUsage: (applied) =>
      transactionChanged(item.tx, applied.processed, item.bucket, applied.bucket),
  });
  if (!correctionApplied) return { handled: false, changed: false };

  const nextTx = correctionApplied.processed;
  const nextBucket = correctionApplied.bucket;
  if (nextBucket === 'matched') buckets.matched.push(nextTx);
  else buckets.uncertain.push(nextTx);

  return { handled: true, changed: transactionChanged(item.tx, nextTx, item.bucket, nextBucket) };
}

function tryEntityMatchStage(
  item: RemainingItem,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator,
  alwaysAffected: boolean
): StageResult {
  const match = matchEntity(item.tx.description, ctx.entityLookup, ctx.aliases);
  if (!match) return { handled: false, changed: false };

  const entityEntry = ctx.entityLookup.get(match.entityName.toLowerCase());
  if (!entityEntry) {
    if (item.bucket === 'failed') buckets.failed.push(item.tx);
    else buckets.uncertain.push(item.tx);
    return { handled: true, changed: false };
  }

  const nextTx: ProcessedTransaction = {
    ...item.tx,
    entity: { entityId: entityEntry.id, entityName: entityEntry.name, matchType: match.matchType },
    status: 'matched',
    error: undefined,
    suggestedTags: buildSuggestedTags(ctx.db, {
      description: item.tx.description,
      entityId: entityEntry.id,
      correctionTags: [],
      aiCategory: null,
      knownTags: ctx.knownTags,
      entityDefaultTags: ctx.entityDefaultTags,
      recordTagRuleUsage: !ctx.isPreview,
    }),
  };

  buckets.matched.push(nextTx);
  return { handled: true, changed: alwaysAffected || transactionChanged(item.tx, nextTx) };
}

/** The full ladder, for a row that is not currently matched. */
export function processRemainingItem(
  item: RemainingItem,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator,
  alwaysAffectedOnEntityMatch: boolean
): boolean {
  const corrStage = tryApplyCorrectionStage(item, ctx, buckets);
  if (corrStage.handled) return corrStage.changed;

  const entityStage = tryEntityMatchStage(item, ctx, buckets, alwaysAffectedOnEntityMatch);
  if (entityStage.handled) return entityStage.changed;

  if (item.bucket === 'failed') buckets.failed.push(item.tx);
  else buckets.uncertain.push(item.tx);
  return false;
}

/**
 * The outcome a matched row takes from a rule that re-decides it.
 *
 * The row stays in `matched` whatever bucket the rule would otherwise route
 * to: a rule is an instruction, not a hypothesis, and there is nothing to ask
 * about a row the user has already settled (finance ADR-004). Discarding a non-`matched`
 * outcome instead made every rule that resolved to `uncertain` on its own — an
 * entity-less purchase rule, or, before finance ADR-004, anything under the old
 * confidence bar — a no-op on matched rows: it matched the row, previewed as
 * covering it, and then changed nothing (POPS-3120).
 *
 * A rule that names no entity keeps the row's own: `buildTypeOnlyMatch`
 * writes an entity-less placeholder, which is right for a row that had no
 * merchant and would erase one here.
 */
function keepMatched(
  prev: ProcessedTransaction,
  applied: ProcessedTransaction,
  winner: CorrectionRow
): ProcessedTransaction {
  return {
    ...applied,
    entity: normalizeEntityId(winner.entityId) ? applied.entity : prev.entity,
    status: 'matched',
  };
}

/**
 * Re-decide an already-matched transaction against the correction rules.
 *
 * A correction rule is created precisely to overrule a match the system got
 * wrong, and every row it overrules is already in `matched` — so passing that
 * bucket through untouched made the rule a no-op for every sibling of the row
 * the user hand-fixed, while the proposal's impact panel counted them (#3814).
 *
 * Every row this path visits already carries the outcome the rule would give
 * it, so usage telemetry is credited only when the re-decision actually moves
 * the row (`countsAsUsage`) — otherwise re-running a re-evaluation, which is
 * supposed to be a no-op, would credit every covered rule again (POPS-2641).
 *
 * Deliberately narrower than `processRemainingItem`: only correction rules
 * apply, never the alias/exact/prefix/contains entity matcher, and the row can
 * never leave `matched` — see {@link keepMatched}. Re-evaluation exists to
 * propagate a rule the user just approved, not to relitigate matches they did
 * not ask about, and a demotion here would silently hand back a row they had
 * already dealt with.
 */
export function reapplyCorrectionToMatched(
  tx: ProcessedTransaction,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator
): boolean {
  // Decide from the winning rule before applying it: a rule with nothing to
  // apply is not worth building the suggested tags for.
  const winner = findAllMatchingCorrectionFromRules(
    tx.description,
    ctx.rules,
    tx.accountId ?? null
  )[0];
  if (!winner || correctionOutcomeBucket(winner) === null) {
    buckets.matched.push(tx);
    return false;
  }

  const correctionApplied = applyLearnedCorrection(ctx.db, {
    transaction: tx,
    knownTags: ctx.knownTags,
    rules: ctx.rules,
    isPreview: ctx.isPreview,
    entityDefaultTags: ctx.entityDefaultTags,
    countsAsUsage: (applied) => transactionChanged(tx, keepMatched(tx, applied.processed, winner)),
  });
  if (!correctionApplied) {
    buckets.matched.push(tx);
    return false;
  }
  const next = keepMatched(tx, correctionApplied.processed, winner);
  buckets.matched.push(next);
  return transactionChanged(tx, next);
}
