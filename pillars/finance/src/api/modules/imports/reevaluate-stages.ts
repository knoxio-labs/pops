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
import { findAllMatchingCorrectionFromRules, type CorrectionRow } from '../corrections/index.js';
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
  minConfidence: number;
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
    minConfidence: ctx.minConfidence,
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
 * apply, never the alias/exact/prefix/contains entity matcher, and an outcome
 * that would drop the row out of `matched` is discarded. Re-evaluation exists
 * to propagate a rule the user just approved, not to relitigate matches they
 * did not ask about — and a demotion here would silently hand back a row they
 * had already dealt with.
 */
export function reapplyCorrectionToMatched(
  tx: ProcessedTransaction,
  ctx: ReevaluateContext,
  buckets: BucketAccumulator
): boolean {
  // Decide from the winning rule before applying it: an outcome this path
  // would discard is not worth building the suggested tags for.
  const winner = findAllMatchingCorrectionFromRules(
    tx.description,
    ctx.rules,
    ctx.minConfidence
  )[0];
  if (!winner || correctionOutcomeBucket(winner) !== 'matched') {
    buckets.matched.push(tx);
    return false;
  }

  const correctionApplied = applyLearnedCorrection(ctx.db, {
    transaction: tx,
    minConfidence: ctx.minConfidence,
    knownTags: ctx.knownTags,
    rules: ctx.rules,
    isPreview: ctx.isPreview,
    entityDefaultTags: ctx.entityDefaultTags,
    countsAsUsage: (applied) => transactionChanged(tx, applied.processed),
  });
  if (!correctionApplied) {
    buckets.matched.push(tx);
    return false;
  }
  buckets.matched.push(correctionApplied.processed);
  return transactionChanged(tx, correctionApplied.processed);
}
