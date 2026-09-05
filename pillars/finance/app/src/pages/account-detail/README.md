# Account detail page

`/accounts/:id` — a per-account dashboard (POPS-2805), not a detail view: header, balance, a
module grid, recent transactions.

## The balance card shows a result, never a checkpoint

`account.balance` rides on every `GET /accounts` row (POPS-2880), so the card needs no request of
its own for the figure — and `useBalanceHistory` fetches only the twelve-month series, which the
list cannot answer. There is deliberately no `useAccountBalance`: a second request for a number
already in hand would be a round trip that buys nothing.

The number is ledger-signed and shown in the account's own terms. A card that owes reads
`-$2,137.55` in the destructive tone; nothing negates a balance before showing it (ADR-051). Points
stay neutral however large, because points are not spendable money — that rule lives in
`@pops/ui` and the accounts grid reads the same one.

The provenance line says where the number came from. `basis: 'checkpoint'` dates it; otherwise it
is net flow since whatever date the import started on, and says so — worded by the kind's
`hasExternalBalance` ("never checked against the bank" vs "never counted"), because every kind can
take a checkpoint and only the wording differs. There is never a placeholder date.

This card is the only thing on the page that knows checkpoints exist, and it shows their _result_ —
a date, a disagreement flag, a link. It never lists or edits them; that is
`/accounts/:id/checkpoints` (POPS-2888). The flag differs from a red liability in **shape**, not colour: a badge with an icon and
a claim, because a card that owes money is already red.

The trend renders nothing at all below two points. One reading is not a trend, and drawing it as a
flat line would be a claim the data does not support.

## The module grid is an empty seam

`ModuleGrid`'s `modulesFor(kind)` returns no modules for every kind today. The per-kind insight
modules (loan amortisation, credit-card insights, ...) are POPS-2807, a separate ticket that
should not start before POPS-2750 lands — most of those modules would need a real balance to chart
against. `modulesFor` is the seam that ticket fills in.

## Deferred, not built here

- **Import pre-scoping**: the header's "Import transactions" action links to
  `/finance/import?account=<id>`, but the import wizard does not yet read that query param — see
  POPS-2875.
- **Settle up**: no settle-up flow exists anywhere in this app yet, so the header omits that action
  entirely for `person`-kind accounts rather than shipping a dead button — see POPS-2876.
