/**
 * Read-only matchers against `transaction_corrections`.
 *
 * Split out from `transaction-corrections.ts` so neither file exceeds the
 * 200-line cap. CRUD lives there; pattern matching lives here. Both
 * surface through the `transactionCorrectionsService` namespace on the
 * package barrel and the in-tree consumer treats them as one slice.
 */
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { MIN_MATCH_CONFIDENCE } from '../../contract/corrections-pure.js';
import { centsToDollars } from '../../money.js';
import { transactionCorrections, transactions } from '../schema.js';
import {
  normalizeDescription,
  patternMatchesNormalizedDescription,
  type TransactionCorrectionMatchType,
  type TransactionCorrectionRow,
} from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';

function ruleMatchesNormalizedDescription(
  rule: TransactionCorrectionRow,
  normalized: string
): boolean {
  return patternMatchesNormalizedDescription(rule.descriptionPattern, rule.matchType, normalized);
}

/**
 * Return every active correction whose pattern matches `description`, in
 * priority order (priority ASC, id ASC as tie-breaker).
 *
 * Filters out rules below `minConfidence` and inactive rules before the
 * in-memory pattern test, mirroring the in-tree
 * `findAllMatchingCorrectionFromDB` semantics.
 */
export function findAllMatchingTransactionCorrectionsFromDb(
  db: FinanceDb,
  description: string,
  minConfidence: number = MIN_MATCH_CONFIDENCE
): TransactionCorrectionRow[] {
  const normalized = normalizeDescription(description);

  const candidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  return candidates.filter((rule) => ruleMatchesNormalizedDescription(rule, normalized));
}

/**
 * Return every active correction whose pattern matches `description`, grouped
 * by `matchType` in `[exact, contains, regex]` order, with each group sorted
 * by `confidence DESC, timesApplied DESC`.
 *
 * Used by callers that need to surface all matches (not just the winning
 * rule) to the user — typically the rule-management UI.
 *
 * Regex rules with invalid patterns are silently dropped so a single
 * malformed entry can't poison the result.
 */
export function findAllMatchingTransactionCorrections(
  db: FinanceDb,
  description: string
): TransactionCorrectionRow[] {
  const normalized = normalizeDescription(description);

  const exactMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, 'exact'),
        eq(transactionCorrections.descriptionPattern, normalized)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const containsMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, 'contains'),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexCandidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(eq(transactionCorrections.isActive, true), eq(transactionCorrections.matchType, 'regex'))
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexMatches: TransactionCorrectionRow[] = [];
  for (const row of regexCandidates) {
    try {
      if (new RegExp(row.descriptionPattern).test(normalized)) {
        regexMatches.push(row);
      }
    } catch {
      // skip invalid regex pattern — see fn doc-comment
    }
  }

  return [...exactMatches, ...containsMatches, ...regexMatches];
}

/** Resolved (defaults already applied) input to {@link previewRuleMatchTransactions}. */
export interface RuleMatchPreviewInput {
  pattern: string;
  matchType: TransactionCorrectionMatchType;
  limit: number;
  offset: number;
}

/** One matched transaction, projected to the fields the rule-impact panel renders. */
export interface RuleMatchPreviewRow {
  id: string;
  checksum: string | null;
  date: string;
  description: string;
  amount: number;
  entityId: string | null;
  entityName: string | null;
}

export interface RuleMatchPreviewResult {
  /** The requested page of matches (`limit`/`offset` applied), newest first. */
  matches: RuleMatchPreviewRow[];
  /** Count of ALL matches across the finance DB — never capped by `limit`. */
  totalCount: number;
}

/**
 * List every transaction a candidate `(pattern, matchType)` rule matches across
 * the whole finance DB, plus the true total, so the rule-management impact panel
 * can show what a rule actually hits (not a truncated sample).
 *
 * Matching is done in JS via {@link patternMatchesNormalizedDescription} against
 * each row's normalised description rather than a SQL `LIKE`: the match set is
 * defined post-{@link normalizeDescription} (digit-stripping + Unicode
 * whitespace collapse), which SQLite's `LIKE` cannot faithfully reproduce
 * without a registered function — and none is registered here. A SQL narrowing
 * could silently under-count, which is exactly the failure this endpoint exists
 * to avoid. The scan carries no caller input into SQL, so there is no injection
 * surface. This mirrors the existing `previewMatches` full-scan approach.
 */
export function previewRuleMatchTransactions(
  db: FinanceDb,
  input: RuleMatchPreviewInput
): RuleMatchPreviewResult {
  const rows = db
    .select({
      id: transactions.id,
      checksum: transactions.checksum,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
      entityId: transactions.entityId,
      entityName: transactions.entityName,
    })
    .from(transactions)
    .orderBy(desc(transactions.date))
    .all();

  const matched = rows.filter((row) =>
    patternMatchesNormalizedDescription(
      input.pattern,
      input.matchType,
      normalizeDescription(row.description)
    )
  );

  return {
    matches: matched
      .slice(input.offset, input.offset + input.limit)
      .map(({ amountCents, ...row }) => ({ ...row, amount: centsToDollars(amountCents) })),
    totalCount: matched.length,
  };
}
