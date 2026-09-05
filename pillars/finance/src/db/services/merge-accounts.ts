/**
 * Merge one account into another (POPS-2812): repoint every transaction,
 * checkpoint, and kind-specific detail row from `sourceId` onto `targetId`,
 * then delete the source outright.
 *
 * Unlike every other account mutation, this hard-deletes rather than
 * archiving (decision log, 2026-09-03): by the time the source row goes,
 * everything that ever pointed at it has been repointed to the survivor, so
 * an archived husk would exist only to say "this was merged into that" —
 * clutter with no reader. That makes the merge irreversible, which is why
 * {@link previewAccountMerge} exists — a caller must be able to show the
 * transaction count and resulting balance before committing.
 *
 * That resulting balance is checkpoint-anchored, so the source's checkpoints
 * have to move with its transactions: `account_checkpoints.account_id`
 * cascades on account delete (POPS-2878) and this is the only path that ever
 * hard-deletes an account, so leaving the cascade to fire would destroy the
 * anchor the preview just quoted and drop the survivor back onto unanchored
 * net flow.
 *
 * Refuses a merge that cannot be meaningful: the same account into itself
 * (`AccountMergeSameAccountError`), across currencies
 * (`AccountMergeCurrencyMismatchError`), across
 * `ACCOUNT_KIND_BEHAVIOURS` sign conventions (`AccountMergeSignMismatchError`
 * — an asset merged into a liability or vice versa), or where both sides
 * carry a machine-written checkpoint for the same day
 * (`AccountMergeCheckpointCollisionError` — the repoint would otherwise trip
 * the partial unique index mid-transaction). Does not run dedup
 * (POPS-2773): two transactions that become duplicates only once they share
 * an account are left for that separate pass to find, not silently merged
 * away here — `previewAccountMerge` only reports whether either account
 * carries gift-card details that would collide, since that case has no
 * automatic resolution at all.
 */
import { and, count, eq, ne } from 'drizzle-orm';

import { getAccountKindBehaviour } from '../../contract/account-kind.js';
import {
  AccountMergeCheckpointCollisionError,
  AccountMergeCurrencyMismatchError,
  AccountMergeGiftCardDetailsConflictError,
  AccountMergePendingResolutionError,
  AccountMergeSameAccountError,
  AccountMergeSignMismatchError,
} from '../merge-account-errors.js';
import {
  accountCheckpoints,
  accountGiftCardDetails,
  accounts,
  entityPrecreateOutbox,
  giftCardSecretReveals,
  transactions,
} from '../schema.js';
import { balanceAsOf } from './account-balance.js';
import { getAccount, type AccountRow } from './accounts.js';
import { isCheckpointConflict } from './checkpoint-conflict.js';

import type { CheckpointSource } from '../../contract/checkpoint.js';
import type { FinanceDb } from './internal.js';

/** Preview of what {@link mergeAccounts} would do, without writing anything. */
export interface AccountMergePreview {
  source: AccountRow;
  target: AccountRow;
  /** Transactions currently on `source` — every one of these moves to `target`. */
  transactionCount: number;
  /**
   * `source`'s balance plus `target`'s balance, in their shared currency's
   * minor units — each checkpoint-anchored (ADR-051), so a preview shows what
   * the merged account will hold rather than the two files' combined net flow.
   */
  resultingBalanceCents: number;
  /**
   * True when both accounts carry an `account_gift_card_details` row —
   * {@link mergeAccounts} refuses the merge in this case
   * (`AccountMergeGiftCardDetailsConflictError`) until the caller resolves
   * which card's details survive.
   */
  hasGiftCardDetailsConflict: boolean;
}

function transactionCount(db: FinanceDb, accountId: string): number {
  const row = db
    .select({ total: count() })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .get();
  return row?.total ?? 0;
}

interface MachineCheckpointKey {
  asOf: string;
  source: CheckpointSource;
}

/**
 * The date and source both accounts carry a machine-written checkpoint for,
 * or undefined if none collide. `manual` is excluded because the partial
 * unique index on `(account_id, as_of, source)` excludes it — two counted
 * figures on one day are allowed to coexist on the merged account.
 */
function machineCheckpointCollision(
  db: FinanceDb,
  sourceId: string,
  targetId: string
): MachineCheckpointKey | undefined {
  const machineCheckpointsOf = (accountId: string): MachineCheckpointKey[] =>
    db
      .select({ asOf: accountCheckpoints.asOf, source: accountCheckpoints.source })
      .from(accountCheckpoints)
      .where(
        and(eq(accountCheckpoints.accountId, accountId), ne(accountCheckpoints.source, 'manual'))
      )
      .all();
  const targetKeys = new Set(
    machineCheckpointsOf(targetId).map((row) => `${row.asOf}|${row.source}`)
  );
  return machineCheckpointsOf(sourceId).find((row) => targetKeys.has(`${row.asOf}|${row.source}`));
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
 * `AccountMergeSignMismatchError`, or `AccountMergeCheckpointCollisionError`
 * — the refusals that make a merge meaningless or unperformable outright,
 * checked by both {@link previewAccountMerge} and {@link mergeAccounts} so a
 * preview never shows numbers for a merge the commit would then refuse.
 */
function assertAccountsAreMergeable(db: FinanceDb, source: AccountRow, target: AccountRow): void {
  if (source.id === target.id) throw new AccountMergeSameAccountError(source.id);
  if (source.currency !== target.currency) {
    throw new AccountMergeCurrencyMismatchError(source.currency, target.currency);
  }
  const sourceSign = getAccountKindBehaviour(source.kind).signConvention;
  const targetSign = getAccountKindBehaviour(target.kind).signConvention;
  if (sourceSign !== targetSign) {
    throw new AccountMergeSignMismatchError(source.kind, target.kind);
  }
  const collision = machineCheckpointCollision(db, source.id, target.id);
  if (collision) {
    throw new AccountMergeCheckpointCollisionError(
      source.id,
      target.id,
      collision.asOf,
      collision.source
    );
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
  assertAccountsAreMergeable(db, source, target);

  return {
    source,
    target,
    transactionCount: transactionCount(db, sourceId),
    resultingBalanceCents:
      balanceAsOf(db, sourceId).balanceCents + balanceAsOf(db, targetId).balanceCents,
    hasGiftCardDetailsConflict:
      hasGiftCardDetails(db, sourceId) && hasGiftCardDetails(db, targetId),
  };
}

/**
 * Merge `sourceId` into `targetId`: repoint every `transactions.account_id`,
 * `account_checkpoints.account_id` and `gift_card_secret_reveals.account_id`
 * from `sourceId` to `targetId`,
 * move `sourceId`'s `account_gift_card_details` row onto `targetId` if
 * `targetId` doesn't already have one, then delete the `sourceId` row.
 *
 * Everything happens inside one `db.transaction` — a thrown error rolls the
 * whole thing back rather than leaving transactions repointed with the
 * source account still present (or vice versa).
 *
 * Throws `AccountNotFoundError` if either id is unknown; the merge
 * refusals from {@link assertAccountsAreMergeable} (including
 * `AccountMergeCheckpointCollisionError`); `AccountMergeGiftCardDetailsConflictError`
 * if both accounts carry gift-card details; and
 * `AccountMergePendingResolutionError` if the source account has an
 * unresolved `entity_precreate_outbox` row (POPS-2771) — merging it away
 * would either resolve that row onto the wrong account or dangle a reference
 * the reconciler can never find again.
 */
export function mergeAccounts(db: FinanceDb, sourceId: string, targetId: string): AccountRow {
  const source = getAccount(db, sourceId);
  const target = getAccount(db, targetId);
  assertAccountsAreMergeable(db, source, target);

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

    try {
      tx.update(accountCheckpoints)
        .set({ accountId: targetId })
        .where(eq(accountCheckpoints.accountId, sourceId))
        .run();
    } catch (err) {
      // `assertAccountsAreMergeable` has already refused every collision the
      // index can hold, and nothing can write between that check and this
      // statement, so this branch is unreachable today and carries no test.
      // It stays because no raw driver error should leave a write to this
      // table — the same reason every other `account_checkpoints` write goes
      // through `isCheckpointConflict`.
      if (!isCheckpointConflict(err)) throw err;
      const collision = machineCheckpointCollision(tx, sourceId, targetId);
      if (!collision) throw err;
      throw new AccountMergeCheckpointCollisionError(
        sourceId,
        targetId,
        collision.asOf,
        collision.source
      );
    }

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
