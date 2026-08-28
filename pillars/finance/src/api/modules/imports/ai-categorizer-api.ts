/**
 * Anthropic request + response parsing for the categorizer. Ported from the
 * monolith `imports/lib/ai-categorizer-api.ts`. Usage/cost/latency is reported
 * to the ai pillar through `@pops/ai-telemetry` (`callWithLogging`,
 * fire-and-forget) — telemetry never alters the call's behaviour.
 *
 * Only an allowlist of transaction fields is sent to the API — the merchant
 * description plus its amount and date — never the raw CSV row or any
 * account/card/reference columns. `contextId` is an opaque import-batch key,
 * never the description, so the telemetry store carries no PII.
 *
 * The batched sibling (`categorizeBatchWithAi`, CP025/#3656) lives in
 * `ai-categorizer-batch-api.ts` and reuses the prompt-rule constants and
 * `callRawApi`/`entryFromParsed` exported here rather than duplicating them.
 */
import { callWithLogging } from '@pops/ai-telemetry';

import { extractJsonFromReply } from '../ai-json.js';
import { withRateLimitRetry } from '../ai-retry.js';
import { ANTHROPIC_PROVIDER, FINANCE_DOMAIN, financeTelemetryDeps } from '../ai-telemetry-deps.js';
import { AiCategorizationError, throwApiError } from './ai-categorizer-error.js';
import {
  buildTransactionData,
  closedFacetFields,
  closedFacetOptions,
  closedFacetReplyShape,
  CONFIDENCE_RULES,
  ENTITY_NAME_RULES,
  knownEntitiesSection,
  PROMPT_VERSION_CATEGORIZE,
  TAGS_RULES,
} from './ai-categorizer-prompt.js';
import { logRejectedTagValues, validateAiTags } from './ai-tag-validation.js';
import { sanitizeEntityName } from './entity-name.js';

export { sanitizeEntityName } from './entity-name.js';

import type Anthropic from '@anthropic-ai/sdk';

import type { AiCacheEntry, CategorizerInput } from './ai-categorizer-types.js';

export const CATEGORIZE_OPERATION = 'imports.categorize';

/** Fallback confidence when the model omits or returns an invalid `confidence` field. */
export const DEFAULT_AI_CATEGORIZATION_CONFIDENCE = 0.7;

export interface ApiCallResponse {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface ApiCallOptions {
  client: Anthropic;
  input: CategorizerInput;
  sanitizedDescription: string;
  model: string;
  maxTokens: number;
  knownTags: string[];
  /** Bounded closed-set hint of existing entity names (CF062/#3661). */
  knownEntityNames?: string[];
  /** Opaque import-batch key for telemetry correlation (never the description). */
  contextId?: string;
}

export interface RawApiCallOptions {
  client: Anthropic;
  prompt: string;
  sanitizedDescription: string;
  model: string;
  maxTokens: number;
  operation: string;
  contextId?: string;
  /** Versioned prompt tag for accept/reject telemetry joins (CF096/#3671). */
  promptVersion?: string;
}

const SINGLE_KNOWN_ENTITY_INSTRUCTION =
  "If the transaction is from one of the known entities, return its name exactly as listed above (same spelling/casing) — do NOT invent a variant spelling. Only return a name outside this list when the merchant genuinely isn't one of them.";

/**
 * Build the single-row categorizer prompt.
 *
 * The tag half is a classification form, not a generation request (POPS-2606):
 * one field per closed namespace, each with its available values enumerated
 * from `knownTags`. Throws `EmptyClosedVocabularyError` when that vocabulary is
 * empty — there is no prompt to build without it.
 */
export function buildPrompt(
  input: CategorizerInput,
  knownTags: string[],
  knownEntityNames: string[] = []
): string {
  const facets = closedFacetOptions(knownTags);
  return `Given this bank transaction, identify the merchant/entity name and classify it on each tag axis below.

${buildTransactionData(input)}

Tag axes and their available values:
${closedFacetFields(facets)}${knownEntitiesSection(knownEntityNames, SINGLE_KNOWN_ENTITY_INSTRUCTION)}

Reply in JSON only: {"entityName": "...", ${closedFacetReplyShape(facets)}, "confidence": 0.0-1.0}

${ENTITY_NAME_RULES}

${TAGS_RULES}

${CONFIDENCE_RULES}`;
}

export async function callRawApi(opts: RawApiCallOptions): Promise<ApiCallResponse> {
  const {
    client,
    prompt,
    sanitizedDescription,
    model,
    maxTokens,
    operation,
    contextId,
    promptVersion,
  } = opts;
  const response = await callWithLogging(
    {
      provider: ANTHROPIC_PROVIDER,
      model,
      operation,
      domain: FINANCE_DOMAIN,
      ...(contextId !== undefined ? { contextId } : {}),
      ...(promptVersion !== undefined ? { promptVersion } : {}),
      call: async () => {
        const created = await withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: maxTokens,
              messages: [{ role: 'user', content: prompt }],
            }),
          sanitizedDescription
        );
        return {
          response: created,
          usage: {
            inputTokens: created.usage.input_tokens,
            outputTokens: created.usage.output_tokens,
          },
        };
      },
    },
    financeTelemetryDeps()
  );
  const block = response.content[0];
  const text = block?.type === 'text' ? block.text : null;
  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export async function callApi(opts: ApiCallOptions): Promise<ApiCallResponse> {
  return callRawApi({
    client: opts.client,
    prompt: buildPrompt(opts.input, opts.knownTags, opts.knownEntityNames),
    sanitizedDescription: opts.sanitizedDescription,
    model: opts.model,
    maxTokens: opts.maxTokens,
    operation: CATEGORIZE_OPERATION,
    promptVersion: PROMPT_VERSION_CATEGORIZE,
    ...(opts.contextId !== undefined ? { contextId: opts.contextId } : {}),
  });
}

export interface RawCategorizerEntry {
  entityName?: string | null;
  tags?: unknown;
  category?: string;
  confidence?: unknown;
  /** The per-facet classification fields — `venue`, `occasion`, `contains`, … */
  [facet: string]: unknown;
}

/**
 * Turn one parsed reply object into an {@link AiCacheEntry}.
 *
 * `knownTags` is the closed vocabulary the prompt was built from, and every tag
 * value in the reply is validated against it: what is not in the closed set for
 * its facet never becomes a tag. The refused values are logged here and carried
 * on the entry so the batch counters can count them.
 */
export function entryFromParsed(
  parsed: RawCategorizerEntry,
  knownTags: readonly string[] = []
): AiCacheEntry {
  const { tags, rejected } = validateAiTags(parsed, knownTags);
  logRejectedTagValues(rejected);
  const confidence =
    typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : DEFAULT_AI_CATEGORIZATION_CONFIDENCE;
  return {
    entityName: sanitizeEntityName(parsed.entityName ?? null),
    category: tags[0] ?? null,
    tags,
    confidence,
    ...(rejected.length > 0 ? { rejectedTagValues: rejected.length } : {}),
  };
}

/**
 * Parse the model's reply into an {@link AiCacheEntry}. Throws
 * `AiCategorizationError('…','PARSE_ERROR')` when the reply holds no parseable
 * JSON object, so the caller degrades the row to *uncertain* rather than
 * hard-failing the whole transaction.
 */
export function buildEntryFromText(text: string, knownTags: readonly string[] = []): AiCacheEntry {
  const jsonSlice = extractJsonFromReply(text);
  if (jsonSlice === null) {
    throw new AiCategorizationError(
      `AI categorizer returned no JSON object: ${text.slice(0, 120)}`,
      'PARSE_ERROR'
    );
  }
  let parsed: RawCategorizerEntry;
  try {
    parsed = JSON.parse(jsonSlice) as RawCategorizerEntry;
  } catch (error) {
    throw new AiCategorizationError(
      `AI categorizer returned unparseable JSON: ${
        error instanceof Error ? error.message : 'parse error'
      }`,
      'PARSE_ERROR'
    );
  }
  return entryFromParsed(parsed, knownTags);
}

export async function callApiOrThrow(opts: ApiCallOptions): Promise<ApiCallResponse> {
  try {
    return await callApi(opts);
  } catch (error) {
    console.error(
      `[AI] API call failed for "${opts.sanitizedDescription}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throwApiError(error);
  }
}
