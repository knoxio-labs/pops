/**
 * Env-derived configuration for every categorizer call shape — the model, the
 * API key, the token budgets, the batch size and the USD cost estimate.
 *
 * Split out of `ai-categorizer.ts` so the tag-only caller (POPS-2596) reads the
 * same model/key/pricing as the entity categorizer instead of carrying a second
 * copy of the env plumbing that could drift from it.
 */
import Anthropic from '@anthropic-ai/sdk';

/** Default categorizer model, overridable via `FINANCE_AI_CATEGORIZER_MODEL`. */
export const CATEGORIZER_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
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
/**
 * Token budget per row in a tag-only reply. Lower than a categorization row's:
 * the reply carries the facet fields only, with no `entityName` or `confidence`.
 */
const TAGS_ONLY_TOKENS_PER_ROW = 80;

function envInt(name: string): number {
  const raw = process.env[name];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

/** True only when the categorizer is explicitly enabled via env. Default: disabled. */
export function isAiCategorizerEnabled(): boolean {
  return process.env['FINANCE_AI_CATEGORIZER_ENABLED'] === 'true';
}

/**
 * True only when the tag-only pass for deterministically matched rows is
 * explicitly enabled (POPS-2596). Deliberately its own gate rather than a
 * consequence of `FINANCE_AI_CATEGORIZER_ENABLED`: this path adds spend to the
 * *common* case (rows the matcher already resolved), not the rare one, so it
 * must be switchable — and measurable — on its own.
 */
export function isTagsForMatchedEnabled(): boolean {
  return process.env['FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED'] === 'true';
}

export function getModel(): string {
  return process.env['FINANCE_AI_CATEGORIZER_MODEL'] ?? CATEGORIZER_DEFAULT_MODEL;
}

export function getMaxTokens(): number {
  const parsed = envInt('FINANCE_AI_CATEGORIZER_MAX_TOKENS');
  return Number.isNaN(parsed) ? DEFAULT_MAX_TOKENS : parsed;
}

export function getApiKey(): string {
  return process.env['ANTHROPIC_API_KEY'] ?? process.env['CLAUDE_API_KEY'] ?? '';
}

/** How many pending rows to fold into one categorization call (CP025/#3656). */
export function getCategorizerBatchSize(): number {
  const parsed = envInt('FINANCE_AI_CATEGORIZER_BATCH_SIZE');
  return Number.isNaN(parsed) ? DEFAULT_CATEGORIZER_BATCH_SIZE : parsed;
}

export function getBatchMaxTokens(rowCount: number): number {
  const parsed = envInt('FINANCE_AI_CATEGORIZER_BATCH_MAX_TOKENS');
  return Number.isNaN(parsed) ? BATCH_TOKENS_PER_ROW * rowCount : parsed;
}

export function getTagsOnlyMaxTokens(rowCount: number): number {
  const parsed = envInt('FINANCE_AI_CATEGORIZER_TAGS_MAX_TOKENS');
  return Number.isNaN(parsed) ? TAGS_ONLY_TOKENS_PER_ROW * rowCount : parsed;
}

export function computeCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
}

/** A client with SDK retries off — `withRateLimitRetry` owns the backoff ladder. */
export function createCategorizerClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 0, timeout: CLIENT_TIMEOUT_MS });
}
