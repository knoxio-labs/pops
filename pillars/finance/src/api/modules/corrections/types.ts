/**
 * Correction-match classification helpers for the imports pipeline.
 *
 * Copied (per the severance rules) from the monolith
 * `core/corrections/types-base.ts`. `CorrectionRow` aliases the pillar db's
 * `TransactionCorrectionRow` rather than re-deriving the column shape.
 */
import { type TransactionCorrectionRow } from '../../../db/index.js';

export type CorrectionRow = TransactionCorrectionRow;

/** Confidence at/above which a learned correction is treated as a confident match. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.9;

export type CorrectionMatchStatus = 'matched' | 'uncertain';

export interface CorrectionMatchResult {
  correction: CorrectionRow;
  status: CorrectionMatchStatus;
}

/**
 * Classify a matched correction as a confident (`matched`) or tentative
 * (`uncertain`) outcome by its confidence relative to
 * {@link HIGH_CONFIDENCE_THRESHOLD}.
 */
export function classifyCorrectionMatch(correction: CorrectionRow): CorrectionMatchResult {
  return {
    correction,
    status: correction.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 'matched' : 'uncertain',
  };
}

/**
 * Resolve the status a correction rule yields when applied automatically —
 * shared by live import and retroactive reclassification so both gate on the
 * same routing:
 *
 * - A rule that carries an entity follows the confidence-based
 *   {@link classifyCorrectionMatch}.
 * - An entity-less `purchase` rule is never a finished match: the review step
 *   still has to resolve a merchant, so it is always `uncertain` regardless of
 *   confidence.
 * - An entity-less `transfer`/`income` rule carries no merchant and follows the
 *   confidence-based classification.
 * - A rule that provides neither an entity nor a transaction type has nothing to
 *   apply and yields `null`.
 */
export function resolveCorrectionApplyStatus(
  correction: CorrectionRow
): CorrectionMatchStatus | null {
  if (correction.entityId) return classifyCorrectionMatch(correction).status;
  if (!correction.transactionType) return null;
  return correction.transactionType === 'purchase'
    ? 'uncertain'
    : classifyCorrectionMatch(correction).status;
}

/** Parse a JSON-encoded tags string from the corrections table into a string array. */
export function parseCorrectionTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
