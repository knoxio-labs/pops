# Account checkpoints page

`/accounts/:id/checkpoints` (POPS-2888) — the record behind the account page's balance: every
checkpoint an account has taken, adding one by hand, deleting a manual mistake, and the detail
behind an inconsistency flag. Checkpoints are plumbing (POPS-2750, POPS-2878): the account
dashboard shows only the result — an as-of date and a flag — and this page owns the history.
Design reference: `pillars/design/src/screens/finance/account-checkpoints.tsx`.

## Three server rules this page surfaces, never duplicates

`checkpointsCreate`/`checkpointsRemove` (POPS-2880) are the source of truth for three refusals,
and the UI's job is to show them honestly rather than re-decide them:

- A future `asOf` 422s. `CheckpointFormSchema` (`types.ts`) refuses the same thing client-side —
  a same-day check, not a race — so the common typo never round-trips to the server, but the
  server's own 422 still surfaces via `unwrap`'s thrown message if it does.
- An archived account 422s. Nothing here disables "Add checkpoint" for one — the affordance stays
  reachable and the refusal's message is what tells the user why, per the same "don't hide the
  path to a refusal" rule the delete button follows below.
- Deleting an `import`/`statement` checkpoint 409s. `CheckpointHistory` only ever renders the
  delete `X` on a `source: 'manual'` row — not because the UI second-guesses the other two, but
  because there is genuinely nothing to click that wouldn't just bounce off the same 409. The
  409's message ("an authoritative figure is not deletable by hand...") is what a user sees if a
  race ever lets one through anyway (`useCheckpointMutations`'s `onError` toast).

## Ledger sign, negated once, at the edge

`account_checkpoints.balance_cents` is ledger-signed exactly like `transactions.amount_cents`
(ADR-051): positive is held, negative is owed, for every kind. The add-checkpoint dialog never
asks for that number directly — a liability kind labels the field "Amount owed" and the user
types the positive figure the real card app shows. `useAccountCheckpointsActions`'s
`toCreateBody` is the one place that gets negated, branching on `getAccountKindBehaviour(kind)
.signConvention` (`@pops/finance`) rather than a duplicated liability list.

## Query keys shared with the real balance card (POPS-2887)

`useCheckpointMutations` invalidates `accountCheckpointsKey`, `accountBalanceHistoryKey`,
`ACCOUNTS_KEY` and `ALL_ACCOUNTS_KEY` on every create/delete. `accountBalanceHistoryKey`'s prefix
matches `useBalanceHistory`'s real query key (`account-detail/useBalanceHistory.ts`), so the
sparkline refreshes without a reload. The balance figure itself needs no dedicated invalidation:
POPS-2887 reads `account.balance` straight off the accounts-list row, which the accounts-list
invalidation already covers. `accountBalanceKey` in `queryKeys.ts` has no reader today — kept for
a future per-account balance query rather than removed, since invalidating a key nothing reads is
free.

## Deferred, not built here

- **No confirm-before-delete.** The manual-row `X` deletes immediately, the same way
  `useTransactionMutations`'s delete does elsewhere in this app — append-only checkpoints have no
  undo/restore counterpart the way a transaction snapshot does, so a confirm step was judged not
  worth the extra click for what the design shipped. Revisit if it proves to be a footgun.
- **No pre-fill of the current balance in "Add checkpoint".** The wire's own current balance
  (`GET /accounts/:id/balance`, POPS-2880) is not fetched by this page — the dialog starts blank
  rather than either adding a query this ticket didn't ask for or fabricating a default from
  stale data.
