/**
 * Per-row paired-transfer orchestration (#3607 Stage 3), shared by the
 * commit-time phase and the reconcile worker: given one row, find its unique
 * transfer counterpart and link both sides, or report why it did not.
 *
 * A row links only when the pairing is *mutual* — the target's unique best
 * candidate must also have the target as ITS unique best. That rejects the
 * "two identical debits competing for one credit" case (each debit sees the one
 * credit as its unique match, but the credit sees two equally-close debits and
 * is therefore ambiguous) instead of greedily mislinking whichever debit is
 * examined first, directly mitigating the paired-transfer false-positive risk.
 */
import { transferPairsService, type FinanceDb, type TransactionRow } from '../../../db/index.js';
import { findPairForTransaction, type PairCandidate } from './pair-transfers.js';

/** The outcome of trying to pair one row. */
export type PairAttemptOutcome = 'linked' | 'ambiguous' | 'no-match' | 'skipped';

/**
 * The read-only prediction behind {@link attemptPairForRow} — same mutuality
 * check, no write. `kind: 'match'` carries the counterpart row so a caller can
 * link it (the live path) or just report it (a dry run), without the two
 * diverging on what counts as a match.
 */
export type PairPrediction =
  | { readonly kind: 'match'; readonly counterpart: TransactionRow }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'no-match' }
  | { readonly kind: 'skipped' };

function toPairCandidate(row: TransactionRow): PairCandidate {
  return {
    id: row.id,
    amount: row.amountCents,
    accountId: row.accountId,
    date: row.date,
    relatedTransactionId: row.relatedTransactionId,
  };
}

function uniqueCounterpartId(
  db: FinanceDb,
  row: TransactionRow,
  windowDays: number
): string | null {
  const candidates = transferPairsService.findPairCandidates(db, row, windowDays);
  const result = findPairForTransaction(
    toPairCandidate(row),
    candidates.map(toPairCandidate),
    windowDays
  );
  return result.kind === 'match' ? result.id : null;
}

/**
 * Predict what {@link attemptPairForRow} would do with `row`, without writing.
 * Applies the same mutuality check (the candidate's own best match must point
 * back at `row`) — a caller that skipped this and re-implemented only the
 * one-directional `findPairForTransaction` call would over-report matches on
 * exactly the "two identical debits competing for one credit" case the
 * mutuality check exists to catch.
 */
export function predictPairOutcome(
  db: FinanceDb,
  row: TransactionRow,
  windowDays: number
): PairPrediction {
  if (row.relatedTransactionId !== null || row.matchRuleId !== null) return { kind: 'skipped' };

  const candidates = transferPairsService.findPairCandidates(db, row, windowDays);
  const forward = findPairForTransaction(
    toPairCandidate(row),
    candidates.map(toPairCandidate),
    windowDays
  );
  if (forward.kind === 'none') return { kind: 'no-match' };
  if (forward.kind === 'ambiguous') return { kind: 'ambiguous' };

  const counterpart = candidates.find((candidate) => candidate.id === forward.id);
  if (!counterpart) return { kind: 'no-match' };

  if (uniqueCounterpartId(db, counterpart, windowDays) !== row.id) return { kind: 'ambiguous' };

  return { kind: 'match', counterpart };
}

/**
 * Try to pair `row` with its unique transfer counterpart, linking both sides on
 * success.
 *
 * - `skipped` — the row is already linked or classified by a correction rule
 *   (rules outrank pairing), so it is not a pairing candidate.
 * - `no-match` — no candidate satisfies the predicate.
 * - `ambiguous` — a candidate exists but the match is not mutually unique, so it
 *   is left for manual resolution rather than linked.
 * - `linked` — a unique mutual counterpart was found and both sides were linked.
 */
export function attemptPairForRow(
  db: FinanceDb,
  row: TransactionRow,
  windowDays: number
): PairAttemptOutcome {
  const prediction = predictPairOutcome(db, row, windowDays);
  if (prediction.kind !== 'match') return prediction.kind;

  return transferPairsService.linkTransferPair(db, row.id, prediction.counterpart.id)
    ? 'linked'
    : 'skipped';
}
