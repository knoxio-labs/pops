/**
 * DB-scanning ChangeSet impact preview for the propose flow — finds candidate
 * transactions matching the rule pattern (SQL prefilter mirroring the monolith
 * normalizer) and diffs their before/after correction outcome. Ported from the
 * monolith `core/corrections/{changeset-impact,preview-helpers}.ts`, rewritten
 * onto a `FinanceDb` handle.
 */
import { sql } from 'drizzle-orm';

import { describeForMatching, patternMatchesDescription } from '../../../contract/pattern-match.js';
import { type FinanceDb, transactionCorrections, transactions } from '../../../db/index.js';
import { applyChangeSetToRules, findMatchingCorrectionFromRules } from './pure.js';
import { parseCorrectionTags, type CorrectionMatchResult, type CorrectionRow } from './types.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type {
  ChangeSetImpactCounts,
  ChangeSetImpactItem,
  CorrectionClassificationOutcome,
} from './ai-types.js';

interface CandidateTransaction {
  id: string;
  description: string;
  /** Carried so the impact preview resolves the winning rule under the same
   * account scope the live matcher would use (POPS-2593). */
  accountId: string;
  tags: string | null;
}

/**
 * Candidate transactions for a rule's impact preview.
 *
 * `exact`/`contains` use a SQL `LIKE` prefilter (mirroring the monolith
 * normalizer) — a coarse superset that `buildImpactItem` narrows down by
 * actually resolving each candidate's winning rule.
 *
 * `regex` has no SQL-side equivalent (sqlite has no `REGEXP` operator here),
 * so the real predicate — {@link patternMatchesDescription} against the raw
 * description, the same test `findAllMatchingCorrectionFromRules` runs at
 * match time (POPS-2600) — is applied in memory over every row. Returning
 * `.where(undefined)` unfiltered, as this used to, handed the impact preview
 * an arbitrary table-order slice instead of actual candidates.
 *
 * Unlimited: the caller counts and caps separately so a truncated count is
 * never reported as the true match count (POPS-2699, mirroring POPS-2599's
 * fix for tag-rule previews).
 */
function fetchCandidates(
  db: FinanceDb,
  matchType: 'exact' | 'contains' | 'regex',
  normalizedPattern: string
): CandidateTransaction[] {
  const columns = {
    id: transactions.id,
    description: transactions.description,
    accountId: transactions.accountId,
    tags: transactions.tags,
  };

  if (matchType === 'regex') {
    return db
      .select(columns)
      .from(transactions)
      .all()
      .filter((row) =>
        patternMatchesDescription(normalizedPattern, 'regex', describeForMatching(row.description))
      );
  }

  const upper = sql`upper(${transactions.description})`;
  const noDigits = sql`replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(${upper}, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')`;
  const collapsed = sql`replace(replace(replace(${noDigits}, '  ', ' '), '  ', ' '), '  ', ' ')`;

  return db
    .select(columns)
    .from(transactions)
    .where(sql`${collapsed} LIKE '%' || ${normalizedPattern} || '%'`)
    .all();
}

function outcomeFromMatch(match: CorrectionMatchResult | null): CorrectionClassificationOutcome {
  if (!match) {
    return {
      ruleId: null,
      entityId: null,
      entityName: null,
      location: null,
      tags: [],
      transactionType: null,
    };
  }
  const r = match.correction;
  return {
    ruleId: r.id,
    entityId: r.entityId ?? null,
    entityName: r.entityName ?? null,
    location: r.location ?? null,
    tags: parseCorrectionTags(r.tags),
    transactionType: r.transactionType ?? null,
  };
}

function mergeTags(base: string[], add: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...base, ...add]) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function tagsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => b[i] === t);
}

function outcomeChanged(
  a: CorrectionClassificationOutcome,
  b: CorrectionClassificationOutcome
): boolean {
  return (
    a.ruleId !== b.ruleId ||
    a.entityId !== b.entityId ||
    a.entityName !== b.entityName ||
    a.location !== b.location ||
    a.transactionType !== b.transactionType ||
    !tagsEqual(a.tags, b.tags)
  );
}

/** Counts over every matching candidate, not just the ones surfaced in `affected`. */
function computeImpactCounts(items: ChangeSetImpactItem[]): ChangeSetImpactCounts {
  let entityChanges = 0;
  let locationChanges = 0;
  let tagChanges = 0;
  let typeChanges = 0;
  for (const item of items) {
    if (
      item.before.entityId !== item.after.entityId ||
      item.before.entityName !== item.after.entityName
    ) {
      entityChanges += 1;
    }
    if (item.before.location !== item.after.location) locationChanges += 1;
    if (item.before.transactionType !== item.after.transactionType) typeChanges += 1;
    if (!tagsEqual(item.before.tags, item.after.tags)) tagChanges += 1;
  }
  return { affected: items.length, entityChanges, locationChanges, tagChanges, typeChanges };
}

function withTagsMerged(
  base: CorrectionClassificationOutcome,
  txTags: string[]
): CorrectionClassificationOutcome {
  return { ...base, tags: mergeTags(txTags, base.tags).toSorted() };
}

function buildImpactItem(
  candidate: CandidateTransaction,
  rulesBefore: CorrectionRow[],
  rulesAfter: CorrectionRow[],
  minConfidence: number
): ChangeSetImpactItem | null {
  const txTags = parseCorrectionTags(candidate.tags ?? '[]');
  const before = withTagsMerged(
    outcomeFromMatch(
      findMatchingCorrectionFromRules(
        candidate.description,
        rulesBefore,
        candidate.accountId,
        minConfidence
      )
    ),
    txTags
  );
  const after = withTagsMerged(
    outcomeFromMatch(
      findMatchingCorrectionFromRules(
        candidate.description,
        rulesAfter,
        candidate.accountId,
        minConfidence
      )
    ),
    txTags
  );
  if (!outcomeChanged(before, after)) return null;
  return { transactionId: candidate.id, description: candidate.description, before, after };
}

export interface ImpactPreviewArgs {
  changeSet: ChangeSet;
  matchType: 'exact' | 'contains' | 'regex';
  normalizedPattern: string;
  minConfidence: number;
  maxPreviewItems: number;
}

/**
 * Counts cover every candidate whose outcome the ChangeSet would change;
 * `affected` is capped at `args.maxPreviewItems`, so `affected.length <
 * counts.affected` means the list is truncated.
 */
export function computeChangeSetImpact(
  db: FinanceDb,
  args: ImpactPreviewArgs
): {
  affected: ChangeSetImpactItem[];
  counts: ChangeSetImpactCounts;
  rulesBefore: CorrectionRow[];
} {
  const candidates = fetchCandidates(db, args.matchType, args.normalizedPattern);
  const rulesBefore = db.select().from(transactionCorrections).all();
  const rulesAfter = applyChangeSetToRules(rulesBefore, args.changeSet);

  const changed: ChangeSetImpactItem[] = [];
  for (const c of candidates) {
    const item = buildImpactItem(c, rulesBefore, rulesAfter, args.minConfidence);
    if (item) changed.push(item);
  }
  return {
    affected: changed.slice(0, args.maxPreviewItems),
    counts: computeImpactCounts(changed),
    rulesBefore,
  };
}
