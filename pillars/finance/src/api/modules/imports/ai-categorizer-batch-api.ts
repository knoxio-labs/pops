/**
 * Batch sibling of `ai-categorizer-api.ts` (CP025/#3656): renders N pending
 * transactions as one numbered prompt and parses a JSON array reply instead
 * of one object per row. Reuses that module's prompt-rule constants and the
 * shared `callRawApi`/`entryFromParsed` plumbing rather than duplicating them
 * — only the batch-specific prompt shape and array parsing live here.
 */
import { extractJsonFromReply } from '../ai-json.js';
import {
  callRawApi,
  entryFromParsed,
  type ApiCallResponse,
  type RawCategorizerEntry,
} from './ai-categorizer-api.js';
import { AiCategorizationError, throwApiError } from './ai-categorizer-error.js';
import {
  buildTransactionData,
  closedFacetFields,
  closedFacetOptions,
  closedFacetReplyShape,
  CONFIDENCE_RULES,
  ENTITY_NAME_RULES,
  knownEntitiesSection,
  PROMPT_VERSION_CATEGORIZE_BATCH,
  TAGS_RULES,
} from './ai-categorizer-prompt.js';

import type Anthropic from '@anthropic-ai/sdk';

import type { AiCacheEntry, CategorizerInput } from './ai-categorizer-types.js';

export const CATEGORIZE_BATCH_OPERATION = 'imports.categorize_batch';

export interface BatchApiCallOptions {
  client: Anthropic;
  inputs: CategorizerInput[];
  model: string;
  maxTokens: number;
  knownTags: string[];
  /** Bounded closed-set hint of existing entity names (CF062/#3661). */
  knownEntityNames?: string[];
  /** Opaque import-batch key for telemetry correlation (never the description). */
  contextId?: string;
}

const BATCH_KNOWN_ENTITY_INSTRUCTION =
  "If a transaction is from one of the known entities, return its name exactly as listed above (same spelling/casing) — do NOT invent a variant spelling. Only return a name outside this list when the merchant genuinely isn't one of them.";

/**
 * Batch sibling of `buildPrompt` — renders every pending transaction as a
 * numbered line and asks for a single JSON array reply instead of N separate
 * round-trips. Same PII allowlist and per-field sanitisation as the
 * single-item prompt (CF008): only {@link CategorizerInput} fields are
 * interpolated.
 */
export function buildBatchPrompt(
  inputs: CategorizerInput[],
  knownTags: string[],
  knownEntityNames: string[] = []
): string {
  const lines = inputs
    .map((input, i) => `${i + 1}. ${buildTransactionData(input).replaceAll('\n', ' | ')}`)
    .join('\n');
  const facets = closedFacetOptions(knownTags);

  return `Given these ${inputs.length} bank transactions, identify the merchant/entity name and classify EACH one on every tag axis below.

${lines}

Tag axes and their available values:
${closedFacetFields(facets)}${knownEntitiesSection(knownEntityNames, BATCH_KNOWN_ENTITY_INSTRUCTION)}

Reply with a JSON array of exactly ${inputs.length} objects, one per transaction IN THE SAME ORDER as listed above: [{"entityName": "...", ${closedFacetReplyShape(facets)}, "confidence": 0.0-1.0}, ...]

${ENTITY_NAME_RULES}

${TAGS_RULES}

${CONFIDENCE_RULES}

Return ONLY the JSON array, no markdown, no explanation.`;
}

export async function callBatchApi(opts: BatchApiCallOptions): Promise<ApiCallResponse> {
  return callRawApi({
    client: opts.client,
    prompt: buildBatchPrompt(opts.inputs, opts.knownTags, opts.knownEntityNames),
    sanitizedDescription: `batch:${opts.inputs.length}`,
    model: opts.model,
    maxTokens: opts.maxTokens,
    operation: CATEGORIZE_BATCH_OPERATION,
    promptVersion: PROMPT_VERSION_CATEGORIZE_BATCH,
    ...(opts.contextId !== undefined ? { contextId: opts.contextId } : {}),
  });
}

/**
 * Parse a batched reply into one {@link AiCacheEntry} per input, aligned by
 * array position. Throws `AiCategorizationError('…','PARSE_ERROR')` only when
 * the reply holds no parseable JSON array at all — a single malformed *entry*
 * (not an object, or short of the requested count) degrades just that row to
 * `null` rather than failing every row in the chunk (mirrors the tolerate-
 * prose principle of #3591 at batch granularity).
 */
export function parseBatchEntries(
  text: string,
  expectedCount: number,
  knownTags: readonly string[] = []
): (AiCacheEntry | null)[] {
  const jsonSlice = extractJsonFromReply(text);
  if (jsonSlice === null) {
    throw new AiCategorizationError(
      `AI categorizer returned no JSON array: ${text.slice(0, 120)}`,
      'PARSE_ERROR'
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (error) {
    throw new AiCategorizationError(
      `AI categorizer returned unparseable JSON: ${
        error instanceof Error ? error.message : 'parse error'
      }`,
      'PARSE_ERROR'
    );
  }
  if (!Array.isArray(parsed)) {
    throw new AiCategorizationError(
      `AI categorizer batch reply was not a JSON array: ${text.slice(0, 120)}`,
      'PARSE_ERROR'
    );
  }
  return Array.from({ length: expectedCount }, (_, i) => {
    const item: unknown = parsed[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
    return entryFromParsed(item as RawCategorizerEntry, knownTags);
  });
}

export async function callBatchApiOrThrow(opts: BatchApiCallOptions): Promise<ApiCallResponse> {
  try {
    return await callBatchApi(opts);
  } catch (error) {
    console.error(
      `[AI] Batch API call failed for ${opts.inputs.length} rows: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throwApiError(error);
  }
}
