/**
 * Correction-match classification helpers for the imports pipeline.
 *
 * Copied (per the severance rules) from the monolith
 * `core/corrections/types-base.ts`. `CorrectionRow` aliases the pillar db's
 * `TransactionCorrectionRow` rather than re-deriving the column shape.
 */
import { type TransactionCorrectionRow } from '../../../db/index.js';

export type CorrectionRow = TransactionCorrectionRow;

export type CorrectionMatchStatus = 'matched' | 'uncertain';

export interface CorrectionMatchResult {
  correction: CorrectionRow;
  status: CorrectionMatchStatus;
}

/**
 * Classify a matched correction rule.
 *
 * A stored correction rule is a human (or a rule) telling the system what a
 * description means, not a probabilistic guess about it — the confidence
 * column is audit data (finance ADR-004), never a gate on whether the rule applies.
 * Every row reaching this function already won its match, so it is always
 * settled: `status` is `matched` unconditionally.
 *
 * Kept as a function rather than inlined at each call site because the
 * REST-facing `CorrectionMatchResult` shape (`{ correction, status }`) has
 * three callers that all need it, and because "a matched rule is settled" is
 * a decision worth naming once rather than repeating.
 */
export function classifyCorrectionMatch(correction: CorrectionRow): CorrectionMatchResult {
  return { correction, status: 'matched' };
}

/**
 * A rule's usable entity id, or `null` when it carries none. The corrections
 * schema stores `entityId` verbatim and allows any string, so a blank or
 * whitespace-only value is not a real entity and must be treated as entity-less
 * — otherwise it slips past the "has entity" gate and can auto-apply (or, in
 * reclassification, overwrite a real merchant with an invalid id).
 */
export function normalizeEntityId(entityId: string | null | undefined): string | null {
  const trimmed = entityId?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve the status a correction rule yields when applied automatically —
 * shared by live import and retroactive reclassification so both gate on the
 * same routing. Provenance decides, not confidence (finance ADR-004):
 *
 * - A rule that carries an entity is a resolved match — `matched`.
 * - An entity-less `purchase` rule is never a finished match: the review step
 *   still has to resolve a merchant, so it is always `uncertain` — a fact
 *   about what the rule can name, not about how sure anyone is.
 * - An entity-less `transfer`/`income` rule carries no merchant to resolve,
 *   so it is a finished match too — `matched`.
 * - A rule that provides neither an entity nor a transaction type has nothing to
 *   apply and yields `null`.
 *
 * A blank/whitespace `entityId` counts as entity-less (see {@link normalizeEntityId}).
 */
export function resolveCorrectionApplyStatus(
  correction: CorrectionRow
): CorrectionMatchStatus | null {
  if (normalizeEntityId(correction.entityId)) return 'matched';
  if (!correction.transactionType) return null;
  return correction.transactionType === 'purchase' ? 'uncertain' : 'matched';
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
