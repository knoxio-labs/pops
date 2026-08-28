/**
 * Pure types + the PII-allowlist projection shared by every categorizer
 * module (`ai-categorizer.ts`, `ai-categorizer-api.ts`,
 * `ai-categorizer-batch-api.ts`, `ai-categorizer-prompt.ts`). Split out on its
 * own so those modules can share these shapes without a dependency cycle:
 * this file depends on nothing but `types.ts`, so every other categorizer
 * module can import from here without importing each other.
 */
import type { ParsedTransaction } from './types.js';

/** Derived AI categorization for one transaction description. */
export interface AiCacheEntry {
  /** Sanitized merchant/brand name, or null when no real merchant is recoverable. */
  entityName: string | null;
  /** Preferred multi-tag result. */
  tags?: string[];
  /** Legacy single-category fallback. */
  category?: string | null;
  /**
   * The model's reported confidence (0.0-1.0) that `entityName` is correct
   * (CF037/#3655). Falls back to `DEFAULT_AI_CATEGORIZATION_CONFIDENCE` when
   * the reply omits or malforms the field.
   */
  confidence: number;
  /**
   * How many values the model returned that were refused by the closed-set
   * validation (POPS-2606). Absent when nothing was refused. Counted into the
   * batch's {@link AiCounters}; the values themselves are logged at the point
   * of rejection, never stored.
   */
  rejectedTagValues?: number;
}

/** Per-call token/cost accounting surfaced to the batch counters. */
export interface AiCallUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiCallResult {
  result: AiCacheEntry | null;
  usage?: AiCallUsage;
}

/** Result of a batched categorization call (CP025/#3656) — one entry per input, aligned by position. */
export interface AiBatchCallResult {
  results: (AiCacheEntry | null)[];
  usage?: AiCallUsage;
}

/**
 * The allowlist of transaction fields the categorizer is permitted to send to
 * the model. This is the PII boundary: the raw CSV row and any
 * account/card/reference columns are intentionally absent from this shape, so
 * nothing outside these fields can reach the Anthropic API.
 */
export interface CategorizerInput {
  /** Merchant text from the mapped description column (what the model classifies). */
  description: string;
  /** Signed transaction amount — disambiguates refunds/fees from purchases. */
  amount?: number;
  /** Transaction date (YYYY-MM-DD) — disambiguates recurring merchants. */
  date?: string;
}

/**
 * Project a parsed transaction down to the {@link CategorizerInput} allowlist.
 * `rawRow`, `account`, `location` and `checksum` are dropped here so they can
 * never be interpolated into the prompt sent to Claude (CF008).
 */
export function toCategorizerInput(
  transaction: Pick<ParsedTransaction, 'description' | 'amount' | 'date'>
): CategorizerInput {
  return {
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
  };
}
