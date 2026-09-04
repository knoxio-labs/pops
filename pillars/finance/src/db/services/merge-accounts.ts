/**
 * Merge one account into another (POPS-2812): repoint every transaction and
 * kind-specific detail row from `sourceId` onto `targetId`, then delete the
 * source outright.
 *
 * Unlike every other account mutation, this hard-deletes rather than
 * archiving (decision log, 2026-09-03): by the time the source row goes,
 * everything that ever pointed at it has been repointed to the survivor, so
 * an archived husk would exist only to say "this was merged into that" —
 * clutter with no reader. That makes the merge irreversible, which is why
 * {@link previewAccountMerge} exists — a caller must be able to show the
 * transaction count and resulting balance before committing.
 *
 * Refuses a merge that cannot be meaningful: the same account into itself
 * (`AccountMergeSameAccountError`), across currencies
 * (`AccountMergeCurrencyMismatchError`), or across
 * `ACCOUNT_KIND_BEHAVIOURS` sign conventions (`AccountMergeSignMismatchError`
 * — an asset merged into a liability or vice versa). Does not run dedup
 * (POPS-2773): two transactions that become duplicates only once they share
 * an account are left for that separate pass to find, not silently merged
 * away here — `previewAccountMerge` only reports whether either account
 * carries gift-card details that would collide, since that case has no
 * automatic resolution at all.
 */
import { count, eq, sum } from 'drizzle-orm';

import { getAccountKindBehaviour } from '../../contract/account-kind.js';
import {
  AccountMergeCurrencyMismatchError,
  AccountMergeGiftCardDetailsConflictError,
  AccountMergePendingResolutionError,
  AccountMergeSameAccountError,
  AccountMergeSignMismatchError,
} from '../merge-account-errors.js';
import {
  accountGiftCardDetails,
  accounts,
  entityPrecreateOutbox,
  giftCardSecretReveals,
  transactions,
} from '../schema.js';
import { getAccount, type AccountRow } from './accounts.js';

import type { FinanceDb } from './internal.js';

/** Preview of what {@link mergeAccounts} would do, without writing anything. */
export interface AccountMergePreview {
  source: AccountRow;
  target: AccountRow;
  /** Transactions currently on `source` — every one of these moves to `target`. */
  transactionCount: number;
  /** `source`'s balance plus `target`'s balance, in their shared currency's minor units. */
  resultingBalanceCents: number;
  /**
   * True when both accounts carry an `account_gift_card_details` row —
   * {@link mergeAccounts} refuses the merge in this case
   * (`AccountMergeGiftCardDetailsConflictError`) until the caller resolves
   * which card's details survive.
   */
  hasGiftCardDetailsConflict: boolean;
}

function balanceCents(db: FinanceDb, accountId: string): number {
  const row = db
    .select({ total: sum(transactions.amountCents) })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .get();
  return Number(row?.total ?? 0);
}

function transactionCount(db: FinanceDb, accountId: string): number {
  const row = db
    .select({ total: count() })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .get();
  return row?.total ?? 0;
}

function hasGiftCardDetails(db: FinanceDb, accountId: string): boolean {
  return (
    db
      .select({ accountId: accountGiftCardDetails.accountId })
      .from(accountGiftCardDetails)
      .where(eq(accountGiftCardDetails.accountId, accountId))
      .get() !== undefined
  );
}

function hasPendingResolution(db: FinanceDb, accountId: string): boolean {
  return (
    db
      .select({ id: entityPrecreateOutbox.id })
      .from(entityPrecreateOutbox)
      .where(eq(entityPrecreateOutbox.accountId, accountId))
      .get() !== undefined
  );
}

/**
 * Throws `AccountMergeSameAccountError`, `AccountMergeCurrencyMismatchError`,
 * or `AccountMergeSignMismatchError` — the three refusals that make a merge
 * meaningless outright, checked by both {@link previewAccountMerge} and
 * {@link mergeAccounts} so a preview never shows numbers for a merge the
 * commit would then refuse.
 */
function assertAccountsAreMergeable(source: AccountRow, target: AccountRow): void {
  if (source.id === target.id) throw new AccountMergeSameAccountError(source.id);
  if (source.currency !== target.currency) {
    throw new AccountMergeCurrencyMismatchError(source.currency, target.currency);
  }
  const sourceSign = getAccountKindBehaviour(source.kind).signConvention;
  const targetSign = getAccountKindBehaviour(target.kind).signConvention;
  if (sourceSign !== targetSign) {
    throw new AccountMergeSignMismatchError(source.kind, target.kind);
  }
}

/**
 * Preview a merge of `sourceId` into `targetId` without writing anything.
 * Throws `AccountNotFoundError` if either id is unknown, and the same
 * refusal errors {@link mergeAccounts} throws for a merge that cannot be
 * meaningful. `hasGiftCardDetailsConflict` is informational here — it does
 * not throw, so a caller can surface the conflict before the user commits to
 * the (otherwise refused) merge.
 */
export function previewAccountMerge(
  db: FinanceDb,
  sourceId: string,
  targetId: string
): AccountMergePreview {
  const source = getAccount(db, sourceId);
  const target = getAccount(db, targetId);
  assertAccountsAreMergeable(source, target);

  return {
    source,
    target,
    transactionCount: transactionCount(db, sourceId),
    resultingBalanceCents: balanceCents(db, sourceId) + balanceCents(db, targetId),
    hasGiftCardDetailsConflict:
      hasGiftCardDetails(db, sourceId) && hasGiftCardDetails(db, targetId),
  };
}

/**
 * Merge `sourceId` into `targetId`: repoint every `transactions.account_id`
 * and `gift_card_secret_reveals.account_id` from `sourceId` to `targetId`,
 * move `sourceId`'s `account_gift_card_details` row onto `targetId` if
 * `targetId` doesn't already have one, then delete the `sourceId` row.
 *
 * Everything happens inside one `db.transaction` — a thrown error rolls the
 * whole thing back rather than leaving transactions repointed with the
 * source account still present (or vice versa).
 *
 * Throws `AccountNotFoundError` if either id is unknown; the merge
 * refusals from {@link assertAccountsAreMergeable}; `AccountMergeGiftCardDetailsConflictError`
 * if both accounts carry gift-card details; and
 * `AccountMergePendingResolutionError` if the source account has an
 * unresolved `entity_precreate_outbox` row (POPS-2771) — merging it away
 * would either resolve that row onto the wrong account or dangle a reference
 * the reconciler can never find again.
 */
export function mergeAccounts(db: FinanceDb, sourceId: string, targetId: string): AccountRow {
  const source = getAccount(db, sourceId);
  const target = getAccount(db, targetId);
  assertAccountsAreMergeable(source, target);

  if (hasGiftCardDetails(db, sourceId) && hasGiftCardDetails(db, targetId)) {
    throw new AccountMergeGiftCardDetailsConflictError(sourceId, targetId);
  }
  if (hasPendingResolution(db, sourceId)) {
    throw new AccountMergePendingResolutionError(sourceId);
  }

  db.transaction((tx) => {
    tx.update(transactions)
      .set({ accountId: targetId })
      .where(eq(transactions.accountId, sourceId))
      .run();

    tx.update(giftCardSecretReveals)
      .set({ accountId: targetId })
      .where(eq(giftCardSecretReveals.accountId, sourceId))
      .run();

    if (hasGiftCardDetails(tx, sourceId) && !hasGiftCardDetails(tx, targetId)) {
      tx.update(accountGiftCardDetails)
        .set({ accountId: targetId })
        .where(eq(accountGiftCardDetails.accountId, sourceId))
        .run();
    }

    tx.delete(accounts).where(eq(accounts.id, sourceId)).run();
  });

  return getAccount(db, targetId);
}
