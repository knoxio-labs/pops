/**
 * AI categorizer seam — routes an unmatched transaction description to
 * Claude to suggest a merchant entity + tags. Reached only after the
 * deterministic ladder (corrections → transfer → entity match) misses.
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
import Anthropic from '@anthropic-ai/sdk';

import { buildEntryFromText, callApiOrThrow } from './ai-categorizer-api.js';
import { callBatchApiOrThrow, parseBatchEntries } from './ai-categorizer-batch-api.js';
import { AiCategorizationError } from './ai-categorizer-error.js';

export {
  toCategorizerInput,
  type AiBatchCallResult,
  type AiCacheEntry,
  type AiCallResult,
  type AiCallUsage,
  type CategorizerInput,
} from './ai-categorizer-types.js';

import type { AiBatchCallResult, AiCallResult, CategorizerInput } from './ai-categorizer-types.js';

/** Default categorizer model, overridable via `FINANCE_AI_CATEGORIZER_MODEL`. */
export const CATEGORIZER_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MODEL = CATEGORIZER_DEFAULT_MODEL;
const DEFAULT_MAX_TOKENS = 200;
// Claude Haiku pricing (USD per 1M tokens) for the cost estimate.
const INPUT_COST_PER_M = 1.0;
const OUTPUT_COST_PER_M = 5.0;
/** Client-side request timeout (ms) — the SDK default (10min) is far too long for a single-row/batch categorization call (CF078/#3670). */
const CLIENT_TIMEOUT_MS = 30_000;

/** Default rows per batched categorization call, overridable via `FINANCE_AI_CATEGORIZER_BATCH_SIZE` (CP025/#3656). */
export const DEFAULT_CATEGORIZER_BATCH_SIZE = 10;
/** Token budget per row in a batch reply, before the `FINANCE_AI_CATEGORIZER_BATCH_MAX_TOKENS` override. */
const BATCH_TOKENS_PER_ROW = 150;

/** True only when the categorizer is explicitly enabled via env. Default: disabled. */
export function isAiCategorizerEnabled(): boolean {
  return process.env['FINANCE_AI_CATEGORIZER_ENABLED'] === 'true';
}

function getModel(): string {
  return process.env['FINANCE_AI_CATEGORIZER_MODEL'] ?? DEFAULT_MODEL;
}

function getMaxTokens(): number {
  const raw = process.env['FINANCE_AI_CATEGORIZER_MAX_TOKENS'];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_TOKENS;
}

function getApiKey(): string {
  return process.env['ANTHROPIC_API_KEY'] ?? process.env['CLAUDE_API_KEY'] ?? '';
}

/** How many pending rows to fold into one categorization call (CP025/#3656). */
export function getCategorizerBatchSize(): number {
  const raw = process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CATEGORIZER_BATCH_SIZE;
}

function getBatchMaxTokens(rowCount: number): number {
  const raw = process.env['FINANCE_AI_CATEGORIZER_BATCH_MAX_TOKENS'];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : BATCH_TOKENS_PER_ROW * rowCount;
}

function computeCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
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

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AiCategorizationError('ANTHROPIC_API_KEY not configured', 'NO_API_KEY');
  }

  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: CLIENT_TIMEOUT_MS });
  const response = await callApiOrThrow({
    client,
    input,
    sanitizedDescription: input.description.trim().slice(0, 100),
    model: getModel(),
    maxTokens: getMaxTokens(),
    knownTags,
    knownEntityNames,
    ...(importBatchId !== undefined && importBatchId !== ''
      ? { contextId: `import_batch:${importBatchId}` }
      : {}),
  });

  if (!response.text) return { result: null };

  const entry = buildEntryFromText(response.text, knownTags);
  return {
    result: entry,
    usage: {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd: computeCostUsd(response.inputTokens, response.outputTokens),
    },
  };
}

/**
 * Batch sibling of {@link categorizeWithAi} (CP025/#3656) — categorizes up to
 * `inputs.length` pending rows in ONE Claude call instead of one round-trip
 * per row, cutting both wall-clock time and the fixed per-call prompt
 * boilerplate under a large import. Same env gating/PII allowlist as the
 * single-row categorizer; the caller (the import batch resolver) is
 * responsible for chunking `inputs` to {@link getCategorizerBatchSize} and for
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

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AiCategorizationError('ANTHROPIC_API_KEY not configured', 'NO_API_KEY');
  }

  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: CLIENT_TIMEOUT_MS });
  const response = await callBatchApiOrThrow({
    client,
    inputs,
    model: getModel(),
    maxTokens: getBatchMaxTokens(inputs.length),
    knownTags,
    knownEntityNames,
    ...(importBatchId !== undefined && importBatchId !== ''
      ? { contextId: `import_batch:${importBatchId}` }
      : {}),
  });

  if (!response.text) return { results: inputs.map(() => null) };

  const results = parseBatchEntries(response.text, inputs.length, knownTags);
  return {
    results,
    usage: {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd: computeCostUsd(response.inputTokens, response.outputTokens),
    },
  };
}
