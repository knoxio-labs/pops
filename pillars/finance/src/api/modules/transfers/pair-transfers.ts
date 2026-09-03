/**
 * Paired-transfer detection — the pure matching algorithm (#3607 Stage 3).
 *
 * Two rows are the opposite legs of an inter-account transfer when they have
 * equal absolute amount, opposite sign, sit in *different* accounts, and fall
 * within a small date window. This module is deliberately side-effect free: it
 * takes a target row plus a candidate pool and decides *which* row (if any) is
 * its unique counterpart. Linking the two rows and flipping their `type` is the
 * caller's job (`linkTransferPair`); scheduling the passes that invoke it is the
 * commit-time phase and the reconcile worker.
 *
 * The "different account" predicate compares `accountId` (POPS-2769) — real,
 * per-institution accounts now exist, so this is an exact identity check
 * rather than a comparison of free-text names. The engine itself stays OFF in
 * production ({@link isTransferPairEnabled} gates both trigger points and
 * defaults to disabled) pending a separate decision to enable it; this ticket
 * does not flip that flag.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 3;

/** The minimal projection of a transaction the matcher needs. */
export interface PairCandidate {
  id: string;
  amount: number;
  accountId: string;
  /** Calendar date, `YYYY-MM-DD`; `transactions.date` carries no time component. */
  date: string;
  relatedTransactionId: string | null;
}

/**
 * Outcome of matching one target against a candidate pool.
 *
 * - `match` — exactly one unambiguous counterpart; safe to auto-link.
 * - `ambiguous` — several equally-close candidates; never auto-link, leave for
 *   manual resolution (mirrors the existing matched/uncertain split rather than
 *   picking arbitrarily).
 * - `none` — no candidate satisfies the predicate.
 */
export type PairResult =
  | { readonly kind: 'match'; readonly id: string }
  | { readonly kind: 'ambiguous'; readonly candidateIds: readonly string[] }
  | { readonly kind: 'none' };

/** Parse a `YYYY-MM-DD` calendar date to epoch ms at UTC midnight (TZ-safe). */
function parseDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * The configurable pairing window in days (default 3, covering weekend /
 * settlement lag). Follows the pillar's `FINANCE_AI_CATEGORIZER_*` env
 * convention; a missing, empty, non-integer, or non-positive value falls back
 * to the default.
 */
export function getTransferPairWindowDays(): number {
  const raw = process.env['FINANCE_TRANSFER_PAIR_WINDOW_DAYS'];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_DAYS;
}

/**
 * True only when paired-transfer detection is explicitly enabled via env.
 * Default: disabled — the engine must not touch production data until #3608
 * ships real per-account values.
 */
export function isTransferPairEnabled(): boolean {
  return process.env['FINANCE_TRANSFER_PAIR_ENABLED'] === 'true';
}

/**
 * Find the unique transfer counterpart of `target` within `candidates`.
 *
 * A candidate `C` is eligible when it is a different, still-unlinked row with
 * the same absolute amount, the opposite sign, a different account, and a date
 * within `windowDays` of the target (inclusive). A `target` that is itself
 * already linked yields `none`. Among eligible candidates the closest date
 * wins; a single closest candidate is a `match`, a tie is `ambiguous`.
 *
 * @param target the row to find a counterpart for
 * @param candidates the pool to search (the target itself is ignored if present)
 * @param windowDays inclusive date window; defaults to {@link getTransferPairWindowDays}
 */
export function findPairForTransaction(
  target: PairCandidate,
  candidates: readonly PairCandidate[],
  windowDays: number = getTransferPairWindowDays()
): PairResult {
  if (target.relatedTransactionId !== null) return { kind: 'none' };

  const targetAbs = Math.abs(target.amount);
  const targetSign = Math.sign(target.amount);
  const targetDay = parseDay(target.date);
  const windowMs = windowDays * DAY_MS;

  const eligible = candidates.filter(
    (candidate) =>
      candidate.id !== target.id &&
      candidate.relatedTransactionId === null &&
      Math.abs(candidate.amount) === targetAbs &&
      Math.sign(candidate.amount) === -targetSign &&
      candidate.accountId !== target.accountId &&
      Math.abs(parseDay(candidate.date) - targetDay) <= windowMs
  );

  if (eligible.length === 0) return { kind: 'none' };

  const distance = (candidate: PairCandidate): number =>
    Math.abs(parseDay(candidate.date) - targetDay);
  const minDistance = Math.min(...eligible.map(distance));
  const closest = eligible.filter((candidate) => distance(candidate) === minDistance);

  const [best, ...rest] = closest;
  if (best && rest.length === 0) return { kind: 'match', id: best.id };
  return { kind: 'ambiguous', candidateIds: closest.map((candidate) => candidate.id) };
}
