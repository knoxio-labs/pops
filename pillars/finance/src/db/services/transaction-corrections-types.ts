/**
 * Public types for the transaction-corrections slice.
 *
 * Split from `transaction-corrections.ts` so neither file exceeds the
 * 200-line cap. CRUD handlers live in `transaction-corrections.ts`,
 * matchers in `transaction-corrections-matching.ts`, both consume the
 * types declared here.
 */
import type { transactionCorrections } from '../schema.js';

/** Raw drizzle row shape — matches the persisted `transaction_corrections` record. */
export type TransactionCorrectionRow = typeof transactionCorrections.$inferSelect;

/** Discriminant for how `descriptionPattern` is interpreted against an incoming description. */
export type TransactionCorrectionMatchType = 'exact' | 'contains' | 'regex';

/** Optional `transaction_type` tag stamped onto the matched transaction. */
export type TransactionCorrectionTransactionType = 'purchase' | 'transfer' | 'income';

/**
 * Mutable subset accepted on create / upsert.
 *
 * `tags` is the structured form callers pass in; the service layer is
 * responsible for serialising it into the on-disk JSON string the schema
 * stores.
 */
export interface CreateTransactionCorrectionInput {
  descriptionPattern: string;
  matchType: TransactionCorrectionMatchType;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  transactionType?: TransactionCorrectionTransactionType | null;
  priority?: number;
}

/** PATCH-semantic update input — every field is optional. */
export interface UpdateTransactionCorrectionInput {
  descriptionPattern?: string;
  matchType?: TransactionCorrectionMatchType;
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  transactionType?: TransactionCorrectionTransactionType | null;
  isActive?: boolean;
  confidence?: number;
  priority?: number;
}

/** Result of a paginated list call. */
export interface TransactionCorrectionListResult {
  rows: TransactionCorrectionRow[];
  total: number;
}

/** Filters + pagination accepted by `listTransactionCorrections`. */
export interface TransactionCorrectionListQuery {
  minConfidence?: number;
  matchType?: TransactionCorrectionMatchType;
  limit: number;
  offset: number;
}

/**
 * Canonical pattern normalisation used by the matcher and on insert/update.
 *
 * Folds diacritics, treats hyphens as a space and strips ampersands/periods,
 * uppercases, strips digits, collapses whitespace, and trims. Kept identical
 * to `contract/corrections-pure.ts`'s `normalizeDescription` (CF056/CP022) —
 * the two must stay in lockstep — and to the entity-matcher's
 * `normalizeKey`, which folds diacritics and punctuation the same way.
 */
export function normalizeDescription(description: string): string {
  return description
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/-/g, ' ')
    .replaceAll(/[&.]/g, '')
    .toUpperCase()
    .replaceAll(/\d+/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Apply-time match predicate shared by the rule matcher and the rule-match
 * preview: does `pattern` (interpreted per `matchType`) hit a pre-normalised
 * description?
 *
 * `normalizedDescription` MUST be the output of {@link normalizeDescription}.
 * The pattern is only uppercased (not fully normalised) and regex runs
 * case-insensitively — identical to how `findAllMatchingTransactionCorrectionsFromDb`
 * decides a rule fires at import time, so a preview cannot diverge from reality.
 */
export function patternMatchesNormalizedDescription(
  pattern: string,
  matchType: TransactionCorrectionMatchType,
  normalizedDescription: string
): boolean {
  switch (matchType) {
    case 'exact':
      return pattern.toUpperCase() === normalizedDescription;
    case 'contains':
      return pattern.length > 0 && normalizedDescription.includes(pattern.toUpperCase());
    case 'regex':
      if (pattern.length === 0) return false;
      try {
        return new RegExp(pattern, 'i').test(normalizedDescription);
      } catch {
        return false;
      }
    default:
      return false;
  }
}
