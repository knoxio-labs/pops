/**
 * AI categorizer seam — routes an unmatched transaction description to
 * Claude to suggest a merchant entity + tags. Reached only after the
 * deterministic ladder (corrections → transfer → entity match) misses.
 *
 * Its tag-only sibling (`tagsOnlyBatchWithAi`, POPS-2596) inverts that
 * condition: it runs for rows the ladder *did* resolve but which carry no
 * suggested tags, where the entity is given and only the classification is
 * asked for.
 *
 * Differences from the monolith categorizer (deliberate for the pillar):
 *   - config from env, not core-settings (`FINANCE_AI_CATEGORIZER_MODEL`,
 *     `FINANCE_AI_CATEGORIZER_MAX_TOKENS`, `ANTHROPIC_API_KEY`/`CLAUDE_API_KEY`);
 *   - gated by `FINANCE_AI_CATEGORIZER_ENABLED` (disabled → no call, `{result:null}`);
 *   - no disk cache and no budget enforcement.
 *
 * Usage/cost is reported to the ai pillar via `@pops/ai-telemetry` (fire-and-
 * forget, in `callApi`). Only an allowlist of transaction fields is sent to the
 * API — the merchant description plus its amount and date; the raw CSV row and
 * any account/card/reference columns are never included. The telemetry
 * `contextId` is an opaque import-batch key, never the description.
 */
import { buildEntryFromText, callApiOrThrow } from './ai-categorizer-api.js';
import { callBatchApiOrThrow, parseBatchEntries } from './ai-categorizer-batch-api.js';
import {
  computeCostUsd,
  createCategorizerClient,
  getApiKey,
  getBatchMaxTokens,
  getMaxTokens,
  getModel,
  getTagsOnlyMaxTokens,
  isAiCategorizerEnabled,
} from './ai-categorizer-config.js';
import { AiCategorizationError } from './ai-categorizer-error.js';
import { callTagsOnlyApiOrThrow, parseTagsOnlyEntries } from './ai-tags-only-api.js';

export {
  CATEGORIZER_DEFAULT_MODEL,
  DEFAULT_CATEGORIZER_BATCH_SIZE,
  getCategorizerBatchSize,
  isAiCategorizerEnabled,
  isTagsForMatchedEnabled,
} from './ai-categorizer-config.js';

export {
  toCategorizerInput,
  type AiBatchCallResult,
  type AiCacheEntry,
  type AiCallResult,
  type AiCallUsage,
  type CategorizerInput,
} from './ai-categorizer-types.js';

export type { TagsOnlyEntry, TagsOnlyInput } from './ai-tags-only-api.js';

import type {
  AiBatchCallResult,
  AiCallResult,
  AiCallUsage,
  CategorizerInput,
} from './ai-categorizer-types.js';
import type { TagsOnlyBatchResult, TagsOnlyInput } from './ai-tags-only-api.js';

function usageFrom(inputTokens: number, outputTokens: number): AiCallUsage {
  return { inputTokens, outputTokens, costUsd: computeCostUsd(inputTokens, outputTokens) };
}

/** The API key, or an `AiCategorizationError` the callers already degrade to an uncertain row. */
function requireApiKey(): string {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AiCategorizationError('ANTHROPIC_API_KEY not configured', 'NO_API_KEY');
  }
  return apiKey;
}

function contextIdOf(importBatchId: string | undefined): { contextId?: string } {
  return importBatchId !== undefined && importBatchId !== ''
    ? { contextId: `import_batch:${importBatchId}` }
    : {};
}

/**
 * Categorize an unknown transaction from its allowlisted fields
 * ({@link CategorizerInput} — merchant description plus amount/date). Resolves
 * to `{result:null}` when the categorizer is disabled or the model returns no
 * usable text; throws `AiCategorizationError` when enabled without a key or on
 * an API failure (the caller degrades that to an uncertain row).
 */
export async function categorizeWithAi(
  input: CategorizerInput,
  importBatchId: string | undefined,
  knownTags: string[],
  knownEntityNames: string[] = []
): Promise<AiCallResult> {
  if (!isAiCategorizerEnabled()) return { result: null };

  const response = await callApiOrThrow({
    client: createCategorizerClient(requireApiKey()),
    input,
    sanitizedDescription: input.description.trim().slice(0, 100),
    model: getModel(),
    maxTokens: getMaxTokens(),
    knownTags,
    knownEntityNames,
    ...contextIdOf(importBatchId),
  });

  if (!response.text) return { result: null };

  return {
    result: buildEntryFromText(response.text, knownTags),
    usage: usageFrom(response.inputTokens, response.outputTokens),
  };
}

/**
 * Batch sibling of {@link categorizeWithAi} (CP025/#3656) — categorizes up to
 * `inputs.length` pending rows in ONE Claude call instead of one round-trip
 * per row, cutting both wall-clock time and the fixed per-call prompt
 * boilerplate under a large import. Same env gating/PII allowlist as the
 * single-row categorizer; the caller (the import batch resolver) is
 * responsible for chunking `inputs` to `getCategorizerBatchSize` and for
 * tripping its shared circuit breaker on a `RATE_LIMITED` throw (CP026).
 */
export async function categorizeBatchWithAi(
  inputs: CategorizerInput[],
  importBatchId: string | undefined,
  knownTags: string[],
  knownEntityNames: string[] = []
): Promise<AiBatchCallResult> {
  if (inputs.length === 0) return { results: [] };
  if (!isAiCategorizerEnabled()) return { results: inputs.map(() => null) };

  const response = await callBatchApiOrThrow({
    client: createCategorizerClient(requireApiKey()),
    inputs,
    model: getModel(),
    maxTokens: getBatchMaxTokens(inputs.length),
    knownTags,
    knownEntityNames,
    ...contextIdOf(importBatchId),
  });

  if (!response.text) return { results: inputs.map(() => null) };

  return {
    results: parseBatchEntries(response.text, inputs.length, knownTags),
    usage: usageFrom(response.inputTokens, response.outputTokens),
  };
}

/**
 * Classify rows whose merchant is already known (POPS-2596) — one call for up
 * to `inputs.length` distinct descriptors, with the entity **given** in the
 * prompt rather than asked for.
 *
 * Gated on `isAiCategorizerEnabled` alone here; the narrower
 * `FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED` gate belongs to the caller
 * (`ai-tags-resolver.ts`), which is also where the trigger predicate and the
 * shared circuit breaker live.
 */
export async function tagsOnlyBatchWithAi(
  inputs: TagsOnlyInput[],
  importBatchId: string | undefined,
  knownTags: string[]
): Promise<TagsOnlyBatchResult> {
  if (inputs.length === 0) return { results: [] };
  if (!isAiCategorizerEnabled()) return { results: inputs.map(() => null) };

  const response = await callTagsOnlyApiOrThrow({
    client: createCategorizerClient(requireApiKey()),
    inputs,
    model: getModel(),
    maxTokens: getTagsOnlyMaxTokens(inputs.length),
    knownTags,
    ...contextIdOf(importBatchId),
  });

  if (!response.text) return { results: inputs.map(() => null) };

  return {
    results: parseTagsOnlyEntries(response.text, inputs.length, knownTags),
    usage: usageFrom(response.inputTokens, response.outputTokens),
  };
}
