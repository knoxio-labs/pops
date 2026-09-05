/**
 * Typed errors raised by `services/merge-accounts.ts` (POPS-2812) — split out
 * of `account-errors.ts` once that file hit its line cap. Re-exported from
 * `errors.ts` so existing `from '../errors.js'` imports keep working.
 */

import type { CheckpointSource } from '../contract/checkpoint.js';

/**
 * A merge named the same account as both source and target. There is
 * nothing to move — refused rather than silently no-opping, since a caller
 * passing the same id twice almost certainly built the request wrong.
 */
export class AccountMergeSameAccountError extends Error {
  override readonly name = 'AccountMergeSameAccountError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Account '${id}' cannot be merged into itself`);
    this.id = id;
  }
}

/**
 * A merge would combine two accounts denominated in different currencies —
 * repointing the transactions would leave the survivor's balance summing
 * amounts in units that don't compare, so the merge is refused rather than
 * silently mixing currencies.
 */
export class AccountMergeCurrencyMismatchError extends Error {
  override readonly name = 'AccountMergeCurrencyMismatchError' as const;
  readonly sourceCurrency: string;
  readonly targetCurrency: string;

  constructor(sourceCurrency: string, targetCurrency: string) {
    super(
      `Cannot merge a '${sourceCurrency}' account into a '${targetCurrency}' account — currencies must match`
    );
    this.sourceCurrency = sourceCurrency;
    this.targetCurrency = targetCurrency;
  }
}

/**
 * A merge would combine an asset-convention account with a liability-convention
 * one (decision log: "reject merging accounts whose signs mean different
 * things — an asset into a liability") — the resulting balance would
 * conflate money held with money owed, so the merge is refused. Compares
 * `getAccountKindBehaviour`'s `signConvention` for each account's `kind`, not
 * the `kind` values themselves, so two different asset kinds (e.g.
 * `checking` into `cash`) merge freely.
 */
export class AccountMergeSignMismatchError extends Error {
  override readonly name = 'AccountMergeSignMismatchError' as const;
  readonly sourceKind: string;
  readonly targetKind: string;

  constructor(sourceKind: string, targetKind: string) {
    super(
      `Cannot merge a '${sourceKind}' account into a '${targetKind}' account — one is an asset and the other a liability`
    );
    this.sourceKind = sourceKind;
    this.targetKind = targetKind;
  }
}

/**
 * Both accounts in a merge carry an `account_gift_card_details` row — each
 * is one card's number/PIN, and there is no rule for which one should win,
 * so the merge is refused until a caller resolves it (e.g. by clearing one
 * side's details first) rather than silently discarding one card's secret.
 */
export class AccountMergeGiftCardDetailsConflictError extends Error {
  override readonly name = 'AccountMergeGiftCardDetailsConflictError' as const;
  readonly sourceId: string;
  readonly targetId: string;

  constructor(sourceId: string, targetId: string) {
    super(
      `Both '${sourceId}' and '${targetId}' carry gift card details — resolve which one to keep before merging`
    );
    this.sourceId = sourceId;
    this.targetId = targetId;
  }
}

/**
 * Both accounts in a merge carry a machine-written checkpoint — an `import`
 * or a `statement` one — for the same `as_of` date. Repointing the source's
 * rows onto the target (see `mergeAccounts`) would collide with the partial
 * unique index on `(account_id, as_of, source)`, so the merge is refused up
 * front, naming the date, rather than surfacing a raw constraint violation
 * from inside the transaction.
 *
 * `manual` sits outside that index entirely, so two hand-counted figures on
 * one day, or a counted figure and an imported one, go on coexisting on the
 * merged account exactly as they did apart.
 */
export class AccountMergeCheckpointCollisionError extends Error {
  override readonly name = 'AccountMergeCheckpointCollisionError' as const;
  readonly sourceId: string;
  readonly targetId: string;
  readonly asOf: string;
  readonly checkpointSource: CheckpointSource;

  constructor(
    sourceId: string,
    targetId: string,
    asOf: string,
    checkpointSource: CheckpointSource
  ) {
    super(
      `Account '${sourceId}' and '${targetId}' each carry a '${checkpointSource}' checkpoint dated ${asOf} — resolve which one to keep before merging`
    );
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.asOf = asOf;
    this.checkpointSource = checkpointSource;
  }
}

/**
 * The source account of a merge has an `entity_precreate_outbox` row still
 * `pending` (POPS-2771) — the reconciler has not yet filled in its real
 * `entityId`, and rewriting `accountId` on that row out from under the merge
 * would either resolve the reconciliation onto the wrong (deleted) account
 * or dangle a reference the reconciler can never find again. Refused until
 * contacts resolves the name, rather than reassigned to the target.
 */
export class AccountMergePendingResolutionError extends Error {
  override readonly name = 'AccountMergePendingResolutionError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Account '${id}' has a pending contact resolution and cannot be merged yet`);
    this.id = id;
  }
}
