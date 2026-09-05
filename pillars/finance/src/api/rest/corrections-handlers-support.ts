/**
 * Projection + read helpers shared by the corrections handlers.
 *
 * Split out of `corrections-handlers.ts` so the handler factory stays under the
 * line cap. Pure-ish data shaping over the finance-owned `transaction_corrections`
 * / `transactions` tables — no HTTP concerns beyond translating the package's
 * `TransactionCorrectionNotFoundError` to the in-tree `NotFoundError` (→ 404)
 * and `TagsOnlyCorrectionError` (CF061/#3650) / `InvalidPatternError`
 * (POPS-2600) to `ValidationError` (→ 400).
 */
import { desc } from 'drizzle-orm';

import { describeForMatching, patternMatchesDescription } from '../../contract/pattern-match.js';
import {
  type FinanceDb,
  type RuleMatchPreviewResult,
  type TransactionCorrectionMatchType,
  type TransactionCorrectionRow,
  type TransactionCorrectionTransactionType,
  type TransactionRow,
  InvalidPatternError,
  TagsOnlyCorrectionError,
  TransactionCorrectionNotFoundError,
  transactionCorrectionsService,
  transactions,
} from '../../db/index.js';
import { centsToDollars } from '../../money.js';
import {
  applyChangeSetToRules,
  parseCorrectionTags,
  type CorrectionRow,
} from '../modules/corrections/index.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { ChangeSet } from '../../contract/rest-corrections.js';
import type { financeCorrectionsContract } from '../../contract/rest-corrections.js';

type Req = ServerInferRequest<typeof financeCorrectionsContract>;

export const DEFAULT_LIMIT = 50;
export const DEFAULT_OFFSET = 0;
const PREVIEW_DEFAULT_LIMIT = 25;
const PREVIEW_HARD_LIMIT = 200;
const RULE_MATCH_PREVIEW_DEFAULT_LIMIT = 100;
const RULE_MATCH_PREVIEW_HARD_LIMIT = 500;
const ALL_RULES_LIMIT = 50_000;

export interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: TransactionCorrectionMatchType;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: TransactionCorrectionTransactionType | null;
  isActive: boolean;
  priority: number;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export function toCorrection(row: TransactionCorrectionRow): Correction {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    tags: parseCorrectionTags(row.tags),
    transactionType: row.transactionType,
    isActive: Boolean(row.isActive),
    priority: row.priority,
    confidence: row.confidence,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export interface PreviewMatchTransactionView {
  id: string;
  description: string;
  accountId: string;
  amount: number;
  date: string;
  entityName: string | null;
  tags: string[];
}

export interface PreviewMatchesResult {
  matches: PreviewMatchTransactionView[];
  total: number;
  scanned: number;
  truncated: boolean;
}

function previewMatchTransaction(row: TransactionRow): PreviewMatchTransactionView {
  return {
    id: row.id,
    description: row.description,
    accountId: row.accountId,
    amount: centsToDollars(row.amountCents),
    date: row.date,
    entityName: row.entityName,
    tags: parseCorrectionTags(row.tags ?? '[]'),
  };
}

/**
 * The transactions a candidate `(pattern, matchType)` rule would match.
 *
 * Routed through `contract/pattern-match.ts`'s `patternMatchesDescription` so
 * the preview cannot disagree with the live matcher. A private copy here
 * tested a `regex` pattern against the digit-stripped description, so a
 * preview of any digit-dependent regex showed no matches for a rule that would
 * match at apply time (POPS-2707).
 */
export function previewMatches(
  db: FinanceDb,
  input: Req['previewMatches']['body']
): PreviewMatchesResult {
  const limit = Math.min(input.limit ?? PREVIEW_DEFAULT_LIMIT, PREVIEW_HARD_LIMIT);
  const rows = db.select().from(transactions).orderBy(desc(transactions.date)).all();

  const matched = rows.filter((row) =>
    patternMatchesDescription(
      input.descriptionPattern,
      input.matchType,
      describeForMatching(row.description)
    )
  );

  const truncated = matched.length > limit;
  const sliced = truncated ? matched.slice(0, limit) : matched;

  return {
    matches: sliced.map(previewMatchTransaction),
    total: matched.length,
    scanned: rows.length,
    truncated,
  };
}

/**
 * List every DB transaction the candidate rule matches, paged, with the true
 * full-DB match count. Applies the request-body defaults / hard cap, then
 * delegates the faithful scan to the service layer.
 */
export function ruleMatchPreview(
  db: FinanceDb,
  input: Req['ruleMatchPreview']['body']
): RuleMatchPreviewResult {
  const limit = Math.min(
    input.limit ?? RULE_MATCH_PREVIEW_DEFAULT_LIMIT,
    RULE_MATCH_PREVIEW_HARD_LIMIT
  );
  return transactionCorrectionsService.previewRuleMatchTransactions(db, {
    pattern: input.pattern,
    matchType: input.matchType,
    limit,
    offset: input.offset ?? DEFAULT_OFFSET,
  });
}

/**
 * All persisted rules with any pending (un-persisted) ChangeSets folded in,
 * in the service's stable order with `temp:` adds appended. Shared by
 * `listMerged` and the `previewChangeSet` baseline so both see the same
 * pending state. A pending op targeting an unknown id throws `NotFoundError`
 * (→ 404 via `runHttp`).
 */
export function mergedRules(
  db: FinanceDb,
  pendingChangeSets?: { changeSet: ChangeSet }[]
): CorrectionRow[] {
  const { rows } = transactionCorrectionsService.listTransactionCorrections(db, {
    limit: ALL_RULES_LIMIT,
    offset: 0,
  });
  if (!pendingChangeSets || pendingChangeSets.length === 0) return rows;
  return pendingChangeSets.reduce<CorrectionRow[]>(
    (acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet),
    rows
  );
}

export function translateCorrectionError(err: unknown, id?: string): never {
  if (err instanceof TransactionCorrectionNotFoundError) {
    throw new NotFoundError('Correction', id ?? err.id);
  }
  if (err instanceof TagsOnlyCorrectionError || err instanceof InvalidPatternError) {
    throw new ValidationError(err.message);
  }
  throw err;
}
