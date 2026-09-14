/**
 * Paired-transfer persistence (#3607 Stage 3) — the DB half of the engine.
 *
 * `findPairCandidates` prefilters the rows that *could* be a target's transfer
 * counterpart (exact-opposite signed cents, different account, still unlinked,
 * within the date window); the pure `findPairForTransaction` matcher then picks
 * the unique one. `linkTransferPair` writes the symmetric link once a unique
 * match is found. Both are uncalled until the commit-time phase and the
 * reconcile worker wire them in, behind the `FINANCE_TRANSFER_PAIR_ENABLED` gate.
 */
import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm';

import { TransactionNotFoundError } from '../errors.js';
import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';
import type { TransactionRow } from './transactions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The target fields the candidate query keys on. */
export interface PairTarget {
  id: string;
  amountCents: number;
  accountId: string;
  date: string;
}

/** Shift a `YYYY-MM-DD` calendar date by whole days, staying in UTC. */
function shiftDate(date: string, deltaDays: number): string {
  const shifted = Date.parse(`${date}T00:00:00Z`) + deltaDays * DAY_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

/**
 * Rows that could be `target`'s transfer counterpart: exact-opposite signed
 * amount (equal-abs + opposite-sign collapse to `amount_cents = -target`), a
 * different account, no existing link, and a date within `windowDays` either
 * side (inclusive). The target row itself is excluded. This is only a
 * prefilter — `findPairForTransaction` applies the type, closest-date and
 * uniqueness decisions over the returned pool.
 *
 * How a row was classified does not matter here. A correction rule is how most
 * real transfer legs get their entity and `transfer` type, so excluding
 * rule-classified rows would exclude almost every genuine pair (POPS-3939); a
 * rule that typed a row anything but `transfer` is refused by the matcher.
 */
export function findPairCandidates(
  db: FinanceDb,
  target: PairTarget,
  windowDays: number
): TransactionRow[] {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.amountCents, -target.amountCents),
        ne(transactions.accountId, target.accountId),
        isNull(transactions.relatedTransactionId),
        gte(transactions.date, shiftDate(target.date, -windowDays)),
        lte(transactions.date, shiftDate(target.date, windowDays)),
        ne(transactions.id, target.id)
      )
    )
    .all();
}

/**
 * Ids of every transaction eligible for pairing — every unlinked row
 * (`related_transaction_id IS NULL`). The reconcile worker re-reads each row
 * fresh before attempting a pair, so returning ids that a later row in the same
 * pass links is harmless — the stale ones simply resolve to `skipped`.
 */
export function listUnpairedTransactionIds(db: FinanceDb): string[] {
  return db
    .select({ id: transactions.id })
    .from(transactions)
    .where(isNull(transactions.relatedTransactionId))
    .all()
    .map((row) => row.id);
}

/**
 * Symmetrically link two transactions as the opposite legs of a transfer: each
 * row's `related_transaction_id` points at the other and both are typed
 * `transfer`. Runs in one DB transaction so two concurrent passes cannot each
 * link one side to a different candidate.
 *
 * Nothing else about either row changes. Its entity, `match_rule_id`,
 * `match_type` and `match_confidence` are kept: a transfer between two of the
 * owner's own accounts still belongs to an entity, and a rule that classified
 * the leg is still the reason it carries that entity. A pairing decision is
 * automatic, not a hand-edit, so this deliberately does NOT route through
 * `updateTransaction` (which stamps `matchType: 'manual'` whenever `type`
 * changes). Provenance for the pairing itself is the related id (AC #3607).
 *
 * Refuses (returns `false`, writes nothing) if either row is `type: 'fee'`
 * (POPS-2830). A loan repayment's interest leg (`fee`/`fee:interest`,
 * synthesised at import — see `commit-loan-split.ts`) must never be
 * reclassified `transfer` just because a caller handed it here with some
 * unrelated exact-opposite row. The matcher already refuses any leg not typed
 * `transfer`; this writer has other callers and keeps its own guard for the one
 * type whose rewrite would silently break a split.
 *
 * Idempotent: if either row already carries a `related_transaction_id`, nothing
 * is written and it returns `false`, so neither trigger re-links an existing
 * pair. Linking a row to itself is likewise a no-op `false`.
 *
 * Atomic against a concurrent pairer: each UPDATE is scoped on
 * `related_transaction_id IS NULL`, so a row linked by another writer between
 * this call's read and its write yields `changes === 0` and is never
 * overwritten. If the first side links but the second loses that race, the
 * first side is restored from its pre-link snapshot, so a one-sided link can
 * never persist — the pair is all-or-nothing. In this pillar (one better-sqlite3
 * connection, every write inside a synchronous `db.transaction`) the read and
 * writes are already atomic against other writers, so the restore path is
 * unreachable here; it exists so the invariant still holds for a future
 * multi-writer caller.
 *
 * @throws TransactionNotFoundError if either id is missing.
 * @returns `true` when both sides were linked, `false` otherwise (already linked, a `fee` leg, equal ids, or a lost race).
 */
export function linkTransferPair(db: FinanceDb, idA: string, idB: string): boolean {
  if (idA === idB) return false;
  return db.transaction((tx) => {
    const rowA = tx.select().from(transactions).where(eq(transactions.id, idA)).get();
    const rowB = tx.select().from(transactions).where(eq(transactions.id, idB)).get();
    if (!rowA) throw new TransactionNotFoundError(idA);
    if (!rowB) throw new TransactionNotFoundError(idB);
    if (rowA.type === 'fee' || rowB.type === 'fee') return false;
    if (rowA.relatedTransactionId !== null || rowB.relatedTransactionId !== null) return false;

    const now = new Date().toISOString();
    const writeLink = (id: string, counterpartId: string): number =>
      tx
        .update(transactions)
        .set({ relatedTransactionId: counterpartId, type: 'transfer', lastEditedTime: now })
        .where(and(eq(transactions.id, id), isNull(transactions.relatedTransactionId)))
        .run().changes;

    if (writeLink(idA, idB) === 0) return false;
    if (writeLink(idB, idA) === 0) {
      tx.update(transactions)
        .set({
          relatedTransactionId: rowA.relatedTransactionId,
          type: rowA.type,
          lastEditedTime: rowA.lastEditedTime,
        })
        .where(eq(transactions.id, idA))
        .run();
      return false;
    }
    return true;
  });
}

/**
 * Break a transfer pair: clear the target leg's `related_transaction_id`, and
 * its counterpart's. The user-facing escape hatch for a false-positive pairing
 * (PRD risk). Runs in one DB transaction.
 *
 * `type` is left alone. Only rows already typed `transfer` are ever paired, so
 * each leg was a transfer before it was linked and is still one after; an
 * unlink that retyped it would corrupt a correctly-classified row.
 *
 * The counterpart is only cleared when the link is SYMMETRIC — its own
 * `related_transaction_id` points back at the target. A corrupt or asymmetric
 * pointer (the target references a row that references someone else, or a plain
 * transaction) clears only the target's dangling pointer and never touches a
 * row that is not actually paired back.
 *
 * Idempotent: called on a row that is not part of a pair
 * (`related_transaction_id IS NULL`) it returns the row untouched, so a
 * double-unlink is harmless.
 *
 * @throws TransactionNotFoundError if `id` is missing.
 * @returns the updated target row.
 */
export function unlinkTransferPair(db: FinanceDb, id: string): TransactionRow {
  return db.transaction((tx) => {
    const row = tx.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!row) throw new TransactionNotFoundError(id);

    const counterpartId = row.relatedTransactionId;
    if (counterpartId === null) return row;

    const now = new Date().toISOString();
    const clearLink = (legId: string): void => {
      tx.update(transactions)
        .set({ relatedTransactionId: null, lastEditedTime: now })
        .where(eq(transactions.id, legId))
        .run();
    };

    clearLink(id);
    const counterpart = tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, counterpartId))
      .get();
    if (counterpart && counterpart.relatedTransactionId === id) clearLink(counterpart.id);

    const updated = tx.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!updated) throw new TransactionNotFoundError(id);
    return updated;
  });
}
