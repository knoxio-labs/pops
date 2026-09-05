# Account detail page

`/accounts/:id` — a per-account dashboard (POPS-2805), not a detail view: header, balance, a
module grid, recent transactions.

## The balance card renders no number

The `accounts` wire schema carries no balance field — POPS-2750 (balance checkpoints) is still
Backlog. Summing an account's transactions client-side would give net flow, not balance, and a
confidently wrong number is worse than none, so `BalanceCard` renders neither a figure nor a
trend. Its provenance line names why, branching on the account kind's real
`getAccountKindBehaviour` (`@pops/finance`) rather than a fabricated guess. Once POPS-2750 ships a
checkpoint, this is where the signed headline number and its 12-month trend land — see the design
reference at `pillars/design/src/kit/account-dashboard.tsx`.

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
