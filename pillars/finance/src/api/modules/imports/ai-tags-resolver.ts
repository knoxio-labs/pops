/**
 * Tag-only AI pass for rows the deterministic ladder already resolved
 * (POPS-2596).
 *
 * The categorizer is wired as a fallback for *entity resolution*, but it is
 * also the only component that can generate a tag rather than look one up.
 * Conflating those two jobs inverted the incentives: a row the matcher
 * resolved perfectly never reached the model, so it arrived at Tag Review with
 * whatever a rule or an entity default happened to supply — often nothing —
 * while a row nothing could identify came back tagged. This pass splits them:
 * it runs after `resolvePendingAi`, over the rows that resolved and came out
 * tag-poor, asking only for the classification with the merchant given.
 *
 * Deliberately narrow, because it adds spend to the common path rather than
 * the rare one:
 *
 *  - its own env gate, `FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED`, default off,
 *    on top of `FINANCE_AI_CATEGORIZER_ENABLED`;
 *  - only rows with **no** suggested tags at all. A row already carrying rule
 *    or entity tags is left alone — a rule the user wrote is not the model's to
 *    second-guess, and topping one up would spend on rows that are not the gap;
 *  - only rows resolved *deterministically*. A row the AI itself resolved was
 *    asked this question in the same run and declined it;
 *  - only rows whose type counts as spend. `venue:`/`occasion:`/`contains:`
 *    describe money spent ON something, so those are the rows POPS-2607's
 *    coverage measurement counts as addressable; a transfer, a fee or an
 *    undecided credit is not a gap this can close;
 *  - one batch entry per distinct (entity, normalized descriptor) pair, so
 *    twelve Woolworths rows cost one entry rather than twelve.
 *
 * Every failure degrades to "no tags", never to a failed or re-bucketed row: an
 * open circuit breaker, a rate-limited provider, a malformed reply and a
 * disabled flag all leave the row exactly as the ladder left it.
 */
import { isSpendType } from '../../../contract/corrections-constants.js';
import { normalizeDescription } from '../../../contract/index.js';
import { tagVocabularyService, type FinanceDb } from '../../../db/index.js';
import { buildAiSuggestedTags } from '../tag-suggester/index.js';
import { AiCategorizationError } from './ai-categorizer-error.js';
import {
  getCategorizerBatchSize,
  isAiCategorizerEnabled,
  isTagsForMatchedEnabled,
  tagsOnlyBatchWithAi,
  toCategorizerInput,
} from './ai-categorizer.js';
import { AiCircuitBreaker } from './ai-circuit-breaker.js';
import { yieldToEventLoop } from './processing-helpers.js';

import type { TagsOnlyInput } from './ai-categorizer.js';
import type { TransactionProcessResult } from './process-transaction.js';
import type { AiCounters, ProcessContext, ProcessedTransaction } from './types.js';

export interface ResolveTagsForMatchedArgs {
  db: FinanceDb;
  context: ProcessContext;
  counters: AiCounters;
  /** The settled rows, indexed by position in the caller's list; tag-poor ones are filled in place. */
  results: (TransactionProcessResult | undefined)[];
  /** Shared with `resolvePendingAi`, so a provider that rate-limited the entity pass stops this one too. */
  breaker?: AiCircuitBreaker;
}

/** One distinct (entity, normalized descriptor) pair and every row that shares it. */
interface TagGroup {
  request: TagsOnlyInput;
  rows: ProcessedTransaction[];
}

function classifiedRow(result: TransactionProcessResult | undefined): ProcessedTransaction | null {
  return result?.matched ?? result?.uncertain ?? null;
}

/**
 * The trigger predicate.
 *
 * `matchType: 'ai'` is excluded rather than merely unlikely: the entity pass
 * returns tags in the same reply as the entity, so an AI-resolved row with no
 * tags is one the model has already declined to classify, and asking again in
 * the same run buys nothing.
 */
function isTagPoorSpendMatch(row: ProcessedTransaction): boolean {
  const { entityId, entityName, matchType } = row.entity;
  if (entityId === undefined || entityId === '' || matchType === 'ai') return false;
  if (entityName === undefined || entityName === '') return false;
  if (row.transactionType === undefined || !isSpendType(row.transactionType)) return false;
  return (row.suggestedTags?.length ?? 0) === 0;
}

/**
 * Collapse the tag-poor rows onto one request each.
 *
 * Keyed on the entity as well as the descriptor: bank descriptors repeat
 * heavily within one import, which is the saving, but two rows sharing a
 * normalized descriptor can still have resolved to different entities (an alias
 * on one, a correction rule on the other) and a prompt naming only the first
 * one's merchant would be asking about a transaction it is not showing.
 */
function groupTagPoorRows(results: (TransactionProcessResult | undefined)[]): TagGroup[] {
  const groups = new Map<string, TagGroup>();
  for (const result of results) {
    const row = classifiedRow(result);
    if (!row || !isTagPoorSpendMatch(row)) continue;
    const key = `${row.entity.entityId ?? ''}\t${normalizeDescription(row.description)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(key, {
      request: { entityName: row.entity.entityName ?? '', input: toCategorizerInput(row) },
      rows: [row],
    });
  }
  return [...groups.values()];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

interface ChunkArgs {
  env: ResolveTagsForMatchedArgs;
  groups: TagGroup[];
  breaker: AiCircuitBreaker;
  knownTagSet: tagVocabularyService.KnownTagSet;
}

async function resolveChunk(args: ChunkArgs): Promise<void> {
  const { env, groups, breaker, knownTagSet } = args;
  const { context, counters } = env;

  let batch;
  try {
    batch = await tagsOnlyBatchWithAi(
      groups.map((group) => group.request),
      context.importBatchId,
      context.knownTags
    );
    breaker.recordRecovery();
  } catch (error) {
    if (!(error instanceof AiCategorizationError)) throw error;
    if (error.code === 'RATE_LIMITED') breaker.recordRateLimited();
    // Deliberately silent on `aiError`/`aiFailureCount`: no row failed and none
    // was re-bucketed, so an AI_API_ERROR warning here would report rows lost
    // that are sitting in `matched` exactly as the ladder left them.
    return;
  }

  const { results, usage } = batch;
  if (usage) {
    counters.aiApiCalls++;
    counters.totalInputTokens += usage.inputTokens;
    counters.totalOutputTokens += usage.outputTokens;
    counters.totalCostUsd += usage.costUsd;
  }
  groups.forEach((group, i) => {
    const entry = results[i];
    if (!entry) return;
    counters.aiTagValuesRejected += entry.rejectedTagValues ?? 0;
    if (entry.tags.length === 0) return;
    const suggested = buildAiSuggestedTags(entry.tags, knownTagSet);
    // A fresh array per row: the rows in a group are distinct transactions and
    // the wizard edits their suggestions independently.
    for (const row of group.rows) row.suggestedTags = suggested.map((tag) => ({ ...tag }));
  });
}

/**
 * Fill in AI tags for the tag-poor deterministically-matched rows in
 * `results`. A no-op — no call, no counter movement — whenever either gate is
 * off or nothing is tag-poor, so a run with the flag off is identical to one
 * from before this pass existed.
 */
export async function resolveTagsForMatched(args: ResolveTagsForMatchedArgs): Promise<void> {
  if (!isTagsForMatchedEnabled() || !isAiCategorizerEnabled()) return;

  const groups = groupTagPoorRows(args.results);
  if (groups.length === 0) return;

  const breaker = args.breaker ?? new AiCircuitBreaker();
  const knownTagSet = tagVocabularyService.loadKnownTagSet(args.db);
  for (const items of chunk(groups, getCategorizerBatchSize())) {
    if (breaker.isOpen) return;
    await resolveChunk({ env: args, groups: items, breaker, knownTagSet });
    await yieldToEventLoop();
  }
}
