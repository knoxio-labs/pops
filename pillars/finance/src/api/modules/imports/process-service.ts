/**
 * Import processing core — dedup + entity matching (pure read flow, no writes).
 *
 * Dedup routes through the pillar's `importsService`; the entity-match maps are
 * built from the contact set fetched live from the contacts pillar per run (no
 * mirror). The correction rule set is likewise fetched once per run
 * (CF040/#3664) and threaded through `ProcessContext` so `classifyWithoutAi`
 * never re-queries it per transaction. Classification runs in two passes
 * (CP025/#3656): the deterministic ladder (`classifyWithoutAi`) resolves each
 * row synchronously, and every row that falls through to the AI stage is
 * deferred to `resolvePendingAi`, which folds them into shared batched Claude
 * calls instead of one round-trip per row. A third, separately gated pass
 * (`resolveTagsForMatched`, POPS-2596) then classifies the rows the ladder DID
 * resolve but left with no suggested tags.
 */
import {
  type FinanceDb,
  importsService,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { type PendingAiItem, resolvePendingAi } from './ai-batch-resolver.js';
import { AiCircuitBreaker } from './ai-circuit-breaker.js';
import { resolveTagsForMatched } from './ai-tags-resolver.js';
import { buildFailure } from './process-transaction-helpers.js';
import { classifyWithoutAi, type TransactionProcessResult } from './process-transaction.js';
import {
  appendBatchItem,
  buildAiUsage,
  buildAiWarnings,
  makeBuckets,
  type ProcessBuckets,
  PROGRESS_INTERVAL_ROWS,
  type ProgressBatchItem,
  yieldToEventLoop,
} from './processing-helpers.js';
import { loadKnownTags } from './tag-management.js';
import { createAiCounters } from './types.js';

import type { updateProgress } from './progress-store.js';
import type {
  AiCounters,
  ErrorEntry,
  ParsedTransaction,
  ProcessContext,
  ProcessedTransaction,
  ProcessImportOutput,
} from './types.js';

type ImportProgressUpdate = Parameters<typeof updateProgress>[2];
type ImportProgressCallback = (update: ImportProgressUpdate) => void;

export interface ProcessCoreInput {
  db: FinanceDb;
  contacts: ContactsClient;
  transactions: ParsedTransaction[];
  importBatchId: string;
  onProgress?: ImportProgressCallback;
}

export interface ProcessCoreOutput {
  output: ProcessImportOutput;
  errors: ErrorEntry[];
  processedNewCount: number;
}

/**
 * Split a batch against what is already committed. Repeated checksums *within*
 * a batch are deliberately kept: a statement legitimately lists two identical
 * purchases on one day, and they share a canonical checksum. Overlap between
 * merged CSVs is removed upstream by raw-row identity, where file boundaries
 * are still known.
 */
function partitionByChecksum(
  db: FinanceDb,
  transactions: ParsedTransaction[]
): { newTransactions: ParsedTransaction[]; duplicates: ParsedTransaction[] } {
  const existing = importsService.findExistingChecksums(
    db,
    transactions.map((t) => t.checksum)
  );
  return {
    newTransactions: transactions.filter((t) => !existing.has(t.checksum)),
    duplicates: transactions.filter((t) => existing.has(t.checksum)),
  };
}

function buildSkippedBucket(duplicates: ParsedTransaction[]): ProcessedTransaction[] {
  return duplicates.map((t) => ({
    ...t,
    entity: { matchType: 'none' as const },
    status: 'skipped' as const,
    skipReason: 'Duplicate transaction (checksum match)',
  }));
}

function pushClassified(buckets: ProcessBuckets, result: TransactionProcessResult): void {
  if (result.matched) buckets.matched.push(result.matched);
  if (result.uncertain) buckets.uncertain.push(result.uncertain);
  if (result.failed) buckets.failed.push(result.failed);
}

interface ProcessLoopArgs {
  db: FinanceDb;
  newTransactions: ParsedTransaction[];
  context: ProcessContext;
  counters: AiCounters;
  buckets: ProcessBuckets;
  onProgress?: ImportProgressCallback;
}

/**
 * Pass 1: run the non-AI ladder for every row. Rows it resolves land straight
 * in `results`; rows that fall through collect into the returned `pending`
 * list for the batched AI pass. A thrown error (e.g. a DB failure) degrades
 * that one row to `failed` rather than aborting the run.
 *
 * This pass is where a no-AI import spends nearly all of its time, so it is
 * also where progress has to come from. Reporting only from the bookkeeping
 * loop that follows leaves the client showing `0/N` for the whole run and then
 * jumping straight to the result.
 *
 * The count reported is rows *settled*, not rows walked: rows deferred to the
 * AI pass are not done yet, and counting them here would leave the bar full
 * before the longest part of the run had started.
 */
async function classifyWithoutAiPass(
  loopArgs: Pick<ProcessLoopArgs, 'db' | 'newTransactions' | 'context' | 'counters'> & {
    onProgress?: ImportProgressCallback;
  },
  results: (TransactionProcessResult | undefined)[]
): Promise<PendingAiItem[]> {
  const { db, newTransactions, context, counters, onProgress } = loopArgs;
  const pending: PendingAiItem[] = [];
  for (let i = 0; i < newTransactions.length; i++) {
    const transaction = newTransactions[i];
    if (!transaction) continue;
    try {
      const staged = classifyWithoutAi({ db, transaction, context, counters });
      if (staged.kind === 'resolved') {
        results[i] = staged.result;
      } else {
        pending.push({ index: i, transaction });
      }
    } catch (error) {
      const { failed, errorEntry } = buildFailure(transaction, error);
      results[i] = { failed, batchStatus: 'failed', errorEntry };
    }
    if (onProgress && (i + 1) % PROGRESS_INTERVAL_ROWS === 0) {
      onProgress({ processedCount: i + 1 - pending.length });
      await yieldToEventLoop();
    }
  }
  return pending;
}

async function runProcessLoop(args: ProcessLoopArgs): Promise<{ errors: ErrorEntry[] }> {
  const { db, newTransactions, context, counters, buckets, onProgress } = args;
  const results: (TransactionProcessResult | undefined)[] = Array.from({
    length: newTransactions.length,
  });

  const pending = await classifyWithoutAiPass(args, results);
  const settledByLadder = newTransactions.length - pending.length;
  // One breaker for both AI passes: a provider that rate-limited the entity
  // pass has not recovered by the time the tag pass starts, and giving that
  // pass its own breaker would pay a second full retry ladder to learn it.
  const breaker = new AiCircuitBreaker();
  if (pending.length > 0) {
    onProgress?.({ currentStep: 'categorizing', processedCount: settledByLadder });
    await resolvePendingAi({
      db,
      pending,
      context,
      counters,
      results,
      breaker,
      onResolved: (resolvedCount) =>
        onProgress?.({ processedCount: settledByLadder + resolvedCount }),
    });
  }
  await resolveTagsForMatched({ db, context, counters, results, breaker });
  onProgress?.({ processedCount: newTransactions.length });

  const currentBatch: ProgressBatchItem[] = [];
  const errors: ErrorEntry[] = [];

  for (let i = 0; i < newTransactions.length; i++) {
    const transaction = newTransactions[i];
    const result = results[i];
    if (!transaction || !result) continue;

    pushClassified(buckets, result);
    if (result.errorEntry) errors.push(result.errorEntry);

    if (onProgress) {
      appendBatchItem(currentBatch, {
        description: transaction.description.slice(0, 50),
        status: result.batchStatus,
        ...(result.errorEntry ? { error: result.errorEntry.error } : {}),
      });
      // Bookkeeping only — every row is already classified by this point, so
      // this loop runs to completion inside one tick. Re-sending `processedCount`
      // here would walk the count from 0 back up behind a bar that pass 1 has
      // already filled, which reads as the import restarting.
      onProgress({ currentBatch: [...currentBatch] });
    }
  }

  return { errors };
}

export async function processImportCore(args: ProcessCoreInput): Promise<ProcessCoreOutput> {
  const { db, contacts, transactions, importBatchId, onProgress } = args;

  onProgress?.({ currentStep: 'deduplicating', processedCount: 0 });
  const { newTransactions, duplicates } = partitionByChecksum(db, transactions);

  onProgress?.({ currentStep: 'matching', processedCount: 0 });
  const contactSet = await contacts.fetchAllEntities();
  const { entityLookup, aliasMap: aliases } = importsService.buildEntityMaps(contactSet);
  const entityDefaultTags = importsService.buildDefaultTagsByEntity(contactSet);
  const knownTags = loadKnownTags(db);
  const correctionRules = transactionCorrectionsService.listTransactionCorrections(db, {
    limit: 50_000,
    offset: 0,
  }).rows;

  const buckets = makeBuckets();
  buckets.skipped = buildSkippedBucket(duplicates);

  const counters = createAiCounters();
  const context: ProcessContext = {
    entityLookup,
    aliases,
    knownTags,
    importBatchId,
    entityDefaultTags,
    correctionRules,
  };

  const { errors } = await runProcessLoop({
    db,
    newTransactions,
    context,
    counters,
    buckets,
    onProgress,
  });

  const warnings = buildAiWarnings(counters);
  return {
    output: {
      ...buckets,
      warnings: warnings.length > 0 ? warnings : undefined,
      aiUsage: buildAiUsage(counters),
    },
    errors,
    processedNewCount: newTransactions.length,
  };
}
