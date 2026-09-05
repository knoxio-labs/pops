/**
 * Read-only matchers against `transaction_corrections`.
 *
 * Split out from `transaction-corrections.ts` so neither file exceeds the
 * 200-line cap. CRUD lives there; pattern matching lives here. Both
 * surface through the `transactionCorrectionsService` namespace on the
 * package barrel and the in-tree consumer treats them as one slice.
 */
import { and, asc, desc, eq, gte, isNull, or, type SQL } from 'drizzle-orm';

import {
  compareRuleScope,
  MIN_MATCH_CONFIDENCE,
  ruleAppliesToAccount,
} from '../../contract/corrections-pure.js';
import { centsToDollars } from '../../money.js';
import { transactionCorrections, transactions } from '../schema.js';
import {
  describeForMatching,
  patternMatchesDescription,
  type MatchableDescription,
  type TransactionCorrectionMatchType,
  type TransactionCorrectionRow,
} from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';

const MATCH_TYPE_GROUP_ORDER: readonly TransactionCorrectionMatchType[] = [
  'exact',
  'contains',
  'regex',
];

function ruleMatchesDescription(
  rule: TransactionCorrectionRow,
  description: MatchableDescription
): boolean {
  return patternMatchesDescription(rule.descriptionPattern, rule.matchType, description);
}

/**
 * SQL narrowing for the account scope: an unscoped rule (`account_id IS NULL`)
 * plus, when the caller knows the account, that account's own rules.
 *
 * `accountId === null` (a description-only probe with no account in hand)
 * narrows nothing — see {@link ruleAppliesToAccount} for why a probe must see
 * scoped rules too.
 */
function accountScopeFilter(accountId: string | null): SQL | undefined {
  if (accountId === null) return undefined;
  return or(
    isNull(transactionCorrections.accountId),
    eq(transactionCorrections.accountId, accountId)
  );
}

/**
 * Return every active correction whose pattern matches `description` and whose
 * account scope admits `accountId`, account-scoped rules first, then in
 * priority order (priority ASC, id ASC as tie-breaker).
 *
 * `accountId` is the transaction's `accounts.id`, or `null` for a caller with
 * no account in hand. Scope is the outermost ordering key, so an
 * account-scoped rule beats a global one on the same description whatever
 * their priorities — see {@link compareRuleScope} (POPS-2593).
 *
 * Filters out rules below `minConfidence` and inactive rules before the
 * in-memory pattern test, mirroring the in-tree
 * `findAllMatchingCorrectionFromDB` semantics.
 */
export function findAllMatchingTransactionCorrectionsFromDb(
  db: FinanceDb,
  description: string,
  accountId: string | null,
  minConfidence: number = MIN_MATCH_CONFIDENCE
): TransactionCorrectionRow[] {
  const matchable = describeForMatching(description);

  const candidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        gte(transactionCorrections.confidence, minConfidence),
        accountScopeFilter(accountId)
      )
    )
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  return candidates
    .filter((rule) => ruleMatchesDescription(rule, matchable))
    .toSorted(compareRuleScope);
}

/**
 * Fetch every active correction at or above `minConfidence`, unordered.
 *
 * This is the query {@link findAllMatchingTransactionCorrections} used to run
 * once per description. A caller matching many descriptions in one run (the
 * tag-suggester's correction pass, invoked twice per row by the tag-rule
 * preview) fetches this set once and matches every description against it in
 * memory with {@link findAllMatchingTransactionCorrectionsFromRows}, instead
 * of re-issuing the same SELECT per call (POPS-2634).
 */
export function listActiveTransactionCorrectionsForMatching(
  db: FinanceDb,
  minConfidence: number = MIN_MATCH_CONFIDENCE
): TransactionCorrectionRow[] {
  return db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .all();
}

/**
 * Match `description` against an already-fetched active-correction set, with
 * account-scoped rules first, then grouped by `matchType` in
 * `[exact, contains, regex]` order, each group sorted by
 * `confidence DESC, timesApplied DESC, id ASC`.
 *
 * The account scope is filtered here rather than in SQL, because `rows` is a
 * set the caller already holds — a scope narrowing baked into the fetch would
 * be wrong for every other description this same set is matched against. That
 * is the same reason the pattern predicate runs here (POPS-2593/POPS-2600).
 *
 * The pure counterpart of {@link findAllMatchingTransactionCorrections}: same
 * ordering, grouping and pattern predicate, but over rows the caller already
 * holds rather than a fresh SELECT. `rows` is expected to already be filtered
 * to active + `minConfidence`-and-above (what
 * {@link listActiveTransactionCorrectionsForMatching} returns) — this
 * function does not re-apply that filter.
 */
export function findAllMatchingTransactionCorrectionsFromRows(
  rows: readonly TransactionCorrectionRow[],
  description: string,
  accountId: string | null
): TransactionCorrectionRow[] {
  const matchable = describeForMatching(description);

  const matched = rows
    .toSorted((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.timesApplied !== a.timesApplied) return b.timesApplied - a.timesApplied;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    })
    .filter(
      (rule) => ruleAppliesToAccount(rule, accountId) && ruleMatchesDescription(rule, matchable)
    );

  const byMatchType = MATCH_TYPE_GROUP_ORDER.flatMap((matchType) =>
    matched.filter((rule) => rule.matchType === matchType)
  );
  return byMatchType.toSorted(compareRuleScope);
}

/**
 * Return every active correction at or above `minConfidence` whose pattern
 * matches `description` and whose account scope admits `accountId`,
 * account-scoped rules first, then grouped by `matchType` in
 * `[exact, contains, regex]` order, each group sorted by
 * `confidence DESC, timesApplied DESC, id ASC`.
 *
 * Used by callers that need to surface all matches (not just the winning
 * rule) rather than a single classification verdict — today, the
 * tag-suggester's correction pass. The `minConfidence` floor defaults to
 * {@link MIN_MATCH_CONFIDENCE}, matching
 * {@link findAllMatchingTransactionCorrectionsFromDb}: a rule the engine
 * judges too weak to classify a transaction must not be trusted to tag it
 * either (POPS-2601). Pass `0` to see sub-floor matches — a surface that
 * deliberately lists demoted rules, or a test isolating the pattern
 * predicate.
 *
 * The pattern test runs in JS over a single candidate fetch rather than in
 * SQL. The three per-match-type SQL queries this replaces each had their own
 * semantics (a raw `LIKE` with no `upper()`, a regex with no `i` flag), so
 * this matcher disagreed with the classification matcher about the same row
 * (POPS-2600). SQLite's `LIKE` cannot faithfully reproduce the shared
 * predicate's match set without a registered function — the same reasoning
 * {@link previewRuleMatchTransactions} already documents.
 *
 * A single call fetches and matches in one shot; a caller matching many
 * descriptions per run should call
 * {@link listActiveTransactionCorrectionsForMatching} once and reuse
 * {@link findAllMatchingTransactionCorrectionsFromRows} instead.
 */
export function findAllMatchingTransactionCorrections(
  db: FinanceDb,
  description: string,
  accountId: string | null,
  minConfidence: number = MIN_MATCH_CONFIDENCE
): TransactionCorrectionRow[] {
  return findAllMatchingTransactionCorrectionsFromRows(
    listActiveTransactionCorrectionsForMatching(db, minConfidence),
    description,
    accountId
  );
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
 * Matching is done in JS via {@link patternMatchesDescription} rather than a
 * SQL `LIKE`: the `exact`/`contains` match set is defined post-normalisation
 * (digit-stripping + Unicode whitespace collapse) and the `regex` one needs a
 * regex engine, neither of which SQLite's `LIKE` can faithfully reproduce
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
    patternMatchesDescription(input.pattern, input.matchType, describeForMatching(row.description))
  );

  return {
    matches: matched
      .slice(input.offset, input.offset + input.limit)
      .map(({ amountCents, ...row }) => ({ ...row, amount: centsToDollars(amountCents) })),
    totalCount: matched.length,
  };
}
