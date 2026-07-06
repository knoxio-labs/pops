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
 * calls instead of one round-trip per row.
 */
import {
  type FinanceDb,
  importsService,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { type PendingAiItem, resolvePendingAi } from './ai-batch-resolver.js';
import { buildFailure } from './process-transaction-helpers.js';
import { classifyWithoutAi, type TransactionProcessResult } from './process-transaction.js';
import {
  appendBatchItem,
  buildAiUsage,
  buildAiWarnings,
  makeBuckets,
  type ProcessBuckets,
  type ProgressBatchItem,
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

type ImportProgressUpdate = Parameters<typeof updateProgress>[1];
type ImportProgressCallback = (update: ImportProgressUpdate) => void;

export interface ProcessCoreInput {
  db: FinanceDb;
  contacts: ContactsClient;
  transactions: ParsedTransaction[];
  account: string;
  importBatchId: string;
  onProgress?: ImportProgressCallback;
}

export interface ProcessCoreOutput {
  output: ProcessImportOutput;
  errors: ErrorEntry[];
  processedNewCount: number;
}

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
 * Pass 1: run the synchronous, non-AI ladder for every row. Rows it resolves
 * land straight in `results`; rows that fall through collect into the
 * returned `pending` list for the batched AI pass. A thrown error (e.g. a DB
 * failure) degrades that one row to `failed` rather than aborting the run.
 */
function classifyWithoutAiPass(
  loopArgs: Pick<ProcessLoopArgs, 'db' | 'newTransactions' | 'context' | 'counters'>,
  results: (TransactionProcessResult | undefined)[]
): PendingAiItem[] {
  const { db, newTransactions, context, counters } = loopArgs;
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
  }
  return pending;
}

async function runProcessLoop(args: ProcessLoopArgs): Promise<{ errors: ErrorEntry[] }> {
  const { db, newTransactions, context, counters, buckets, onProgress } = args;
  const results: (TransactionProcessResult | undefined)[] = Array.from({
    length: newTransactions.length,
  });

  const pending = classifyWithoutAiPass(args, results);
  if (pending.length > 0) {
    await resolvePendingAi({ db, pending, context, counters, results });
  }

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
      onProgress({ processedCount: i + 1, currentBatch: [...currentBatch] });
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
