import { isValidRegexPattern, normalizePatternForStorage } from '../../contract/pattern-match.js';
/**
 * Public types for the transaction-corrections slice.
 *
 * Split from `transaction-corrections.ts` so neither file exceeds the
 * 200-line cap. CRUD handlers live in `transaction-corrections.ts`,
 * matchers in `transaction-corrections-matching.ts`, both consume the
 * types and write-time invariants declared here. The match predicate and
 * normaliser are re-exported from `contract/pattern-match.ts` — the one
 * definition every match path shares (POPS-2600) — rather than redeclared.
 */
import { InvalidPatternError } from '../errors.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type { PatternMatchType } from '../../contract/pattern-match.js';
import type { transactionCorrections } from '../schema.js';

export {
  isValidRegexPattern,
  normalizeDescription,
  normalizePatternForStorage,
  patternMatchesNormalizedDescription,
} from '../../contract/pattern-match.js';

/** Raw drizzle row shape — matches the persisted `transaction_corrections` record. */
export type TransactionCorrectionRow = typeof transactionCorrections.$inferSelect;

/** Discriminant for how `descriptionPattern` is interpreted against an incoming description. */
export type TransactionCorrectionMatchType = PatternMatchType;

/** Optional `transaction_type` tag stamped onto the matched transaction.
 * Alias of the canonical {@link TransactionType} (#3607). */
export type TransactionCorrectionTransactionType = TransactionType;

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
 * A `transaction_corrections` row is a **classification** rule: it must carry
 * an `entityId` and/or a `transactionType` to have anything to classify.
 * `tags` is a suggestion payload riding along an entity/type match, never a
 * standalone payload — tag-only learning belongs to `transaction_tag_rules`
 * (see `corrections.md`'s table-boundary note). A row with neither an entity
 * nor a transaction type but non-empty tags is a tags-only row that violates
 * that boundary and can never surface as a classification match (CF061/#3650):
 * it sits at or below the matching floor with nothing for `findMatch` to
 * apply, existing only as rule-manager clutter.
 */
export function isTagsOnlyCorrectionInput(input: {
  entityId?: string | null;
  transactionType?: TransactionCorrectionTransactionType | null;
  tags?: string[];
}): boolean {
  return !input.entityId && !input.transactionType && (input.tags?.length ?? 0) > 0;
}

/** Parse a persisted `tags` column back to a `string[]`, tolerating malformed JSON. */
function parseStoredTags(tagsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(tagsJson);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Would PATCHing `existing` with `input` leave a tags-only row (CF061/#3650)?
 * Overlays `input`'s explicitly-provided `entityId`/`transactionType`/`tags`
 * onto `existing`, PATCH-style (an `undefined` field keeps the existing
 * value), then runs the merged result through {@link isTagsOnlyCorrectionInput}
 * — so an update can't sneak a row past the boundary a create never could.
 */
export function wouldUpdateLeaveTagsOnly(
  existing: Pick<TransactionCorrectionRow, 'entityId' | 'transactionType' | 'tags'>,
  input: Pick<UpdateTransactionCorrectionInput, 'entityId' | 'transactionType' | 'tags'>
): boolean {
  return isTagsOnlyCorrectionInput({
    entityId: input.entityId !== undefined ? input.entityId : existing.entityId,
    transactionType:
      input.transactionType !== undefined ? input.transactionType : existing.transactionType,
    tags: input.tags ?? parseStoredTags(existing.tags),
  });
}

function assertPatternCompiles(pattern: string, matchType: TransactionCorrectionMatchType): void {
  if (matchType === 'regex' && !isValidRegexPattern(pattern)) {
    throw new InvalidPatternError(pattern);
  }
}

/**
 * Store-form of a pattern: normalised for `exact`/`contains`, verbatim for
 * `regex` — and rejected outright when a `regex` pattern doesn't compile.
 *
 * Corrections used to normalise unconditionally, which uppercased regex
 * metacharacters (`\d` -> `\D`, `\s` -> `\S`), stripped digits out of
 * quantifiers (`a{2,3}` -> `a{,}`) and deleted the `.` wildcard, so every
 * regex correction was corrupted on write (POPS-2600). Tag rules already
 * guarded this; corrections did not.
 */
export function storablePattern(
  pattern: string,
  matchType: TransactionCorrectionMatchType
): string {
  assertPatternCompiles(pattern, matchType);
  return normalizePatternForStorage(pattern, matchType);
}

/**
 * Validate the `(pattern, matchType)` pair a PATCH would leave behind, not
 * just the fields it names.
 *
 * `matchType` and `descriptionPattern` are independently optional, so
 * `PATCH { matchType: 'regex' }` alone re-interprets the row's existing
 * pattern as a regular expression without ever passing it through
 * {@link storablePattern}. A stored `exact` pattern is only normalised, not
 * escaped — `normalizeDescription` leaves parens and brackets intact — so
 * `T(ARGET` would become a `regex` row that compiles nowhere and can never
 * fire, the exact failure `InvalidPatternError` exists to prevent.
 *
 * Only a *change* of match type is checked: a PATCH that leaves `matchType`
 * alone must stay able to edit (or disable) a legacy row whose pattern was
 * already uncompilable when it was written.
 */
export function assertPatchLeavesCompilablePattern(
  input: UpdateTransactionCorrectionInput,
  existing: TransactionCorrectionRow,
  effectiveMatchType: TransactionCorrectionMatchType
): void {
  if (input.descriptionPattern !== undefined) return;
  if (input.matchType === undefined || input.matchType === existing.matchType) return;
  assertPatternCompiles(existing.descriptionPattern, effectiveMatchType);
}
