/**
 * The tag-only prompt (POPS-2596): classify rows whose merchant the
 * deterministic ladder already resolved.
 *
 * The categorizer's other two shapes ask "who is this and what is it"; this one
 * asks only the second half, with the merchant supplied. That is the whole
 * point of the ticket — the model is the only component that can *generate* a
 * classification rather than look one up, and wiring it in solely as an
 * entity-resolution fallback meant the rows it could help most (a known
 * merchant with no rule and no default tags) were exactly the rows it never
 * saw.
 *
 * Same PII allowlist as its siblings: only {@link CategorizerInput} fields plus
 * the resolved entity name are interpolated, each sanitized at the boundary.
 */
import { callRawApi, type ApiCallResponse } from './ai-categorizer-api.js';
import { parseJsonArrayReply } from './ai-categorizer-batch-api.js';
import { throwApiError } from './ai-categorizer-error.js';
import {
  buildMatchedTransactionData,
  closedFacetFields,
  closedFacetOptions,
  closedFacetReplyShape,
  PROMPT_VERSION_TAGS_ONLY,
  TAGS_RULES,
} from './ai-categorizer-prompt.js';
import { logRejectedTagValues, validateAiTags, type RawTagFields } from './ai-tag-validation.js';

import type Anthropic from '@anthropic-ai/sdk';

import type { AiCallUsage, CategorizerInput } from './ai-categorizer-types.js';

export const TAGS_ONLY_OPERATION = 'imports.tags_only';

/** One row to classify: the allowlisted transaction fields plus the entity the ladder resolved it to. */
export interface TagsOnlyInput {
  entityName: string;
  input: CategorizerInput;
}

/** One row's classification. No `entityName` and no `confidence` — the merchant was given, not guessed. */
export interface TagsOnlyEntry {
  tags: string[];
  /** How many returned values the closed-set validation refused (POPS-2606). Absent when nothing was refused. */
  rejectedTagValues?: number;
}

export interface TagsOnlyBatchResult {
  results: (TagsOnlyEntry | null)[];
  usage?: AiCallUsage;
}

export interface TagsOnlyApiCallOptions {
  client: Anthropic;
  inputs: TagsOnlyInput[];
  model: string;
  maxTokens: number;
  knownTags: string[];
  /** Opaque import-batch key for telemetry correlation (never the description). */
  contextId?: string;
}

/**
 * Render the tag-only prompt. The reply shape carries the facet fields alone,
 * so a model that volunteers an `entityName` is answering a question that was
 * not asked and the field is ignored — the entity is not the model's to revise
 * here, and a row's merchant must not change on a tag pass.
 */
export function buildTagsOnlyPrompt(inputs: TagsOnlyInput[], knownTags: string[]): string {
  const lines = inputs
    .map(
      ({ entityName, input }, i) =>
        `${i + 1}. ${buildMatchedTransactionData(entityName, input).replaceAll('\n', ' | ')}`
    )
    .join('\n');
  const facets = closedFacetOptions(knownTags);

  return `Given these ${inputs.length} bank transactions, each already identified as the merchant named on its line, classify EACH one on every tag axis below. The merchant is given — do not revise it.

${lines}

Tag axes and their available values:
${closedFacetFields(facets)}

Reply with a JSON array of exactly ${inputs.length} objects, one per transaction IN THE SAME ORDER as listed above: [{${closedFacetReplyShape(facets)}}, ...]

${TAGS_RULES}

Return ONLY the JSON array, no markdown, no explanation.`;
}

export async function callTagsOnlyApi(opts: TagsOnlyApiCallOptions): Promise<ApiCallResponse> {
  return callRawApi({
    client: opts.client,
    prompt: buildTagsOnlyPrompt(opts.inputs, opts.knownTags),
    sanitizedDescription: `tags:${opts.inputs.length}`,
    model: opts.model,
    maxTokens: opts.maxTokens,
    operation: TAGS_ONLY_OPERATION,
    promptVersion: PROMPT_VERSION_TAGS_ONLY,
    ...(opts.contextId !== undefined ? { contextId: opts.contextId } : {}),
  });
}

/** Parse a tag-only reply into one {@link TagsOnlyEntry} per input, aligned by array position. */
export function parseTagsOnlyEntries(
  text: string,
  expectedCount: number,
  knownTags: readonly string[] = []
): (TagsOnlyEntry | null)[] {
  return parseJsonArrayReply(text, expectedCount).map((item) => {
    if (item === null) return null;
    const { tags, rejected } = validateAiTags(item as RawTagFields, knownTags);
    logRejectedTagValues(rejected);
    return { tags, ...(rejected.length > 0 ? { rejectedTagValues: rejected.length } : {}) };
  });
}

export async function callTagsOnlyApiOrThrow(
  opts: TagsOnlyApiCallOptions
): Promise<ApiCallResponse> {
  try {
    return await callTagsOnlyApi(opts);
  } catch (error) {
    console.error(
      `[AI] Tag-only API call failed for ${opts.inputs.length} rows: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throwApiError(error);
  }
}
