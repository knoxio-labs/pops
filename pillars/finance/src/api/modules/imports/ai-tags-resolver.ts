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
 * it runs after `resolvePendingAi`, over deterministic spend rows that can use
 * more classified tags, asking only for tags with the merchant given.
 *
 * Deliberately bounded to classified spend rows:
 *
 *  - it runs whenever `FINANCE_AI_CATEGORIZER_ENABLED` is on; set
 *    `FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED=false` to opt out of its common-path calls;
 *  - already assigned classified tags are shown as fixed context. The model
 *    fills other facets, and its additions cannot replace or conflict with a
 *    single-valued rule or entity tag;
 *  - only rows resolved *deterministically*. A row the AI itself resolved was
 *    asked this question in the same run and declined it;
 *  - only rows whose type counts as spend. `venue:`/`occasion:`/`contains:`
 *    describe money spent ON something, so those are the rows POPS-2607's
 *    coverage measurement counts as addressable; a transfer, a fee or an
 *    undecided credit is not a gap this can close;
 *  - one batch entry per distinct entity, normalized descriptor and assigned
 *    classified tag set, so equivalent rows share a request.
 *
 * Every failure degrades to "no additional tags", never to a failed or
 * re-bucketed row: existing tags and row status stay as the ladder left them.
 */
import { isSpendType } from '../../../contract/corrections-constants.js';
import { normalizeDescription } from '../../../contract/index.js';
import { tagVocabularyService, type FinanceDb } from '../../../db/index.js';
import { entityIdentity, type EntityIdentities } from '../../../db/services/entity-identity.js';
import {
  exceedsFacetCardinality,
  isClassifiedTagFacet,
  parseTagFacet,
} from '../../../db/tag-facets.js';
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
import { createPriorTagSetLoader } from './prior-tagging.js';
import { yieldToEventLoop } from './processing-helpers.js';

import type { TagsOnlyInput } from './ai-categorizer.js';
import type { TransactionProcessResult } from './process-transaction.js';
import type { AiCounters, ProcessContext, ProcessedTransaction } from './types.js';

/** Inputs for the tag-completion pass over deterministic spend matches. */
export interface ResolveTagsForMatchedArgs {
  db: FinanceDb;
  context: ProcessContext;
  counters: AiCounters;
  /** The settled rows, indexed by position in the caller's list; eligible rows are filled in place. */
  results: (TransactionProcessResult | undefined)[];
  /** Shared with `resolvePendingAi`, so a provider that rate-limited the entity pass stops this one too. */
  breaker?: AiCircuitBreaker;
}

/** One entity, normalized descriptor and assigned tag set, with its matching rows. */
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
function isEligibleForTagCompletion(row: ProcessedTransaction): boolean {
  const { entityId, entityName, matchType } = row.entity;
  if (entityId === undefined || entityId === '' || matchType === 'ai') return false;
  if (entityName === undefined || entityName === '') return false;
  if (row.transactionType === undefined || !isSpendType(row.transactionType)) return false;
  return true;
}

function classifiedTags(row: ProcessedTransaction): string[] {
  return (row.suggestedTags ?? [])
    .map(({ tag }) => tag)
    .filter((tag) => isClassifiedTagFacet(parseTagFacet(tag).facet))
    .toSorted();
}

function appendAiSuggestions(
  row: ProcessedTransaction,
  suggestions: ReturnType<typeof buildAiSuggestedTags>
): void {
  const existingSuggestions = row.suggestedTags ?? [];
  const seen = new Set(
    existingSuggestions.map(({ tag }) => tagVocabularyService.normalizeTagForComparison(tag))
  );
  const accepted: typeof suggestions = [];
  for (const suggestion of suggestions) {
    const normalized = tagVocabularyService.normalizeTagForComparison(suggestion.tag);
    if (seen.has(normalized)) continue;
    const existingTags = [...existingSuggestions, ...accepted].map(({ tag }) => tag);
    if (exceedsFacetCardinality(existingTags, suggestion.tag)) continue;
    seen.add(normalized);
    accepted.push(suggestion);
  }
  if (accepted.length > 0) row.suggestedTags = [...existingSuggestions, ...accepted];
}

/**
 * Collapse rows with the same entity, descriptor and assigned classified tags
 * onto one request each.
 *
 * Entity, descriptor and assigned tags define the prompt context: repeated
 * rows share a request, while rows with different deterministic tag decisions
 * receive separate requests.
 */
function groupTagCompletionRows(
  results: (TransactionProcessResult | undefined)[],
  priorTagSetsOf: (entityId: string) => string[][],
  identities?: EntityIdentities
): TagGroup[] {
  const groups = new Map<string, TagGroup>();
  for (const result of results) {
    const row = classifiedRow(result);
    if (!row || !isEligibleForTagCompletion(row)) continue;
    const entityId = row.entity.entityId ?? '';
    const canonicalId = entityIdentity(entityId, identities);
    const existingTags = classifiedTags(row);
    const key = JSON.stringify([
      canonicalId,
      normalizeDescription(row.description),
      existingTags.map((tag) => tagVocabularyService.normalizeTagForComparison(tag)).toSorted(),
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    const priorTagSets = priorTagSetsOf(entityId);
    groups.set(key, {
      request: {
        entityName: row.entity.entityName ?? '',
        input: toCategorizerInput(row),
        ...(row.transactionType === undefined ? {} : { transactionType: row.transactionType }),
        ...(existingTags.length > 0 ? { existingTags } : {}),
        ...(priorTagSets.length > 0 ? { priorTagSets } : {}),
      },
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
  const { db, context, counters } = env;

  let batch;
  try {
    batch = await tagsOnlyBatchWithAi(
      groups.map((group) => group.request),
      context.importBatchId,
      context.knownTags,
      { db, tagDescriptions: context.tagDescriptions }
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
    const suggested = buildAiSuggestedTags(entry.tags, knownTagSet, {
      promptVersion: entry.promptVersion,
      confidence: entry.confidence,
      preAcceptThreshold: context.preAcceptThreshold,
    });
    for (const row of group.rows)
      appendAiSuggestions(
        row,
        suggested.map((tag) => ({ ...tag }))
      );
  });
}

/**
 * Add AI suggestions to deterministic spend matches. Existing suggestions stay
 * in place and take priority; explicit opt-out or disabled AI makes this a no-op.
 */
export async function resolveTagsForMatched(args: ResolveTagsForMatchedArgs): Promise<void> {
  if (!isTagsForMatchedEnabled() || !isAiCategorizerEnabled()) return;

  const groups = groupTagCompletionRows(
    args.results,
    createPriorTagSetLoader(args.db, args.context.identities),
    args.context.identities
  );
  if (groups.length === 0) return;

  const breaker = args.breaker ?? new AiCircuitBreaker();
  const knownTagSet = tagVocabularyService.loadKnownTagSet(args.db);
  for (const items of chunk(groups, getCategorizerBatchSize())) {
    if (breaker.isOpen) return;
    await resolveChunk({ env: args, groups: items, breaker, knownTagSet });
    await yieldToEventLoop();
  }
}
