/**
 * Synchronous re-evaluation of an import session against the current rule set,
 * with no AI. Unmatched rows (uncertain/failed) run the full correction-then-
 * entity-matcher ladder; already-matched rows are re-decided by correction
 * rules only, and never demoted out of `matched`.
 *
 * Ported from the monolith `lib/correction-application.ts`, db-injected. Used by
 * applyChangeSetAndReevaluate (DB rules) and reevaluateWithPendingRules
 * (DB rules merged with un-persisted pending ChangeSets).
 */
import {
  type FinanceDb,
  importsService,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { applyChangeSetToRules } from '../corrections/index.js';
import {
  processRemainingItem,
  reapplyCorrectionToMatched,
  type BucketAccumulator,
  type ReevaluateContext,
  type RemainingItem,
} from './reevaluate-stages.js';
import { loadKnownTags } from './tag-management.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type { ProcessImportOutput } from './types.js';

function runReevaluate(
  result: ProcessImportOutput,
  ctx: ReevaluateContext,
  alwaysAffectedOnEntityMatch: boolean
): { nextResult: ProcessImportOutput; affectedCount: number } {
  const buckets: BucketAccumulator = { matched: [], uncertain: [], failed: [] };

  let affectedCount = 0;
  for (const tx of result.matched) {
    if (reapplyCorrectionToMatched(tx, ctx, buckets)) affectedCount += 1;
  }

  const remaining: RemainingItem[] = [
    ...result.uncertain.map((tx) => ({ tx, bucket: 'uncertain' as const })),
    ...result.failed.map((tx) => ({ tx, bucket: 'failed' as const })),
  ];

  for (const item of remaining) {
    if (processRemainingItem(item, ctx, buckets, alwaysAffectedOnEntityMatch)) affectedCount += 1;
  }

  return {
    nextResult: {
      ...result,
      matched: buckets.matched,
      uncertain: buckets.uncertain,
      failed: buckets.failed,
    },
    affectedCount,
  };
}

/** Re-evaluate against the persisted DB rule set (post-apply). */
export async function reevaluateImportSessionResult(args: {
  db: FinanceDb;
  contacts: ContactsClient;
  result: ProcessImportOutput;
  minConfidence: number;
}): Promise<{ nextResult: ProcessImportOutput; affectedCount: number }> {
  const rules = transactionCorrectionsService.listTransactionCorrections(args.db, {
    limit: 50_000,
    offset: 0,
  }).rows;

  const contactSet = await args.contacts.fetchAllEntities();
  const { entityLookup, aliasMap: aliases } = importsService.buildEntityMaps(contactSet);
  return runReevaluate(
    args.result,
    {
      db: args.db,
      rules,
      isPreview: false,
      minConfidence: args.minConfidence,
      knownTags: loadKnownTags(args.db),
      entityLookup,
      aliases,
      entityDefaultTags: importsService.buildDefaultTagsByEntity(contactSet),
    },
    false
  );
}

/** Re-evaluate against merged rules (DB rules + un-persisted pending ChangeSets). */
export async function reevaluateImportSessionWithRules(args: {
  db: FinanceDb;
  contacts: ContactsClient;
  result: ProcessImportOutput;
  minConfidence: number;
  pendingChangeSets: { changeSet: ChangeSet }[];
}): Promise<{ nextResult: ProcessImportOutput; affectedCount: number }> {
  const dbRules = transactionCorrectionsService.listTransactionCorrections(args.db, {
    limit: 50_000,
    offset: 0,
  }).rows;
  const mergedRules =
    args.pendingChangeSets.length > 0
      ? args.pendingChangeSets.reduce(
          (acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet),
          dbRules
        )
      : dbRules;

  const contactSet = await args.contacts.fetchAllEntities();
  const { entityLookup, aliasMap: aliases } = importsService.buildEntityMaps(contactSet);
  return runReevaluate(
    args.result,
    {
      db: args.db,
      rules: mergedRules,
      isPreview: true,
      minConfidence: args.minConfidence,
      knownTags: loadKnownTags(args.db),
      entityLookup,
      aliases,
      entityDefaultTags: importsService.buildDefaultTagsByEntity(contactSet),
    },
    true
  );
}
