# ADR-050: Accounts as first-class records

## Status

Accepted — 2026-09-04.

## Context

Before this change, a transaction's account was a free-text string
(`transactions.account`) — whatever an importer or a user typed. Nothing
constrained it: "ANZ", "anz", and "A.N.Z." were three different strings, no
query could answer "what accounts exist", and there was nowhere to hang an
account-level property (an institution, a currency, a display order, whether
it is archived).

The accounts epic (POPS-2749) needs a real target to attach money to: every
unit of money is tied to an account at all times, and an account is more than
a label — it has an institution (or none, for cash/person), a currency, a
kind that determines how it behaves on the ledger, and a lifecycle
(active/archived).

Two designs were considered for the two attributes an account needs beyond
its name: which institution issued it, and what it's denominated in.

## Options Considered

| Option                                                                   | Pros                                                                                                                                                                                                 | Cons                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `institution`/`currency` as free text (original scope), checked ISO 4217 | No new tables; fastest to ship                                                                                                                                                                       | "ANZ"/"anz"/"A.N.Z." are three institutions; an account chip keyed on institution identity (logo, brand colour) has nothing reliable to key on; a checked ISO-4217 string can't express a rewards-points balance, which has no currency code |
| `institution_id`/`currency` as FKs onto dedicated tables (chosen)        | One canonical institution per bank, so the account chip can show a logo/colour by id; `currencies` is growable, so a points program (Qantas Points, Membership Rewards) is a currency like any other | Two more tables and two more migrations (POPS-2802, POPS-2803) before this one could land; `institution_id` must be nullable for `cash`/`person`, which have no institution                                                                  |
| Keep `account` as the only column, add no `accounts` table at all        | Simplest possible change                                                                                                                                                                             | Cannot express the epic's other requirements at all — no kind, no per-account currency, no way to list "your accounts" as a screen                                                                                                           |

Both FK`d options were pulled out of this ticket's original scope during
design review (partway through POPS-2765/POPS-2767) rather than being inline
columns as first scoped — the original text for this migration had
`institution`as nullable free text and`currency` as a checked ISO-4217
string. The review's objections were concrete rather than aesthetic: the
account chip planned in POPS-2766 needs an institution's logo and brand
colour, which a free-text string cannot key against consistently, and gift
cards / rewards-points balances (raised in the epic's design pass) are not
denominated in anything with an ISO 4217 code.

## Decision

`accounts` is a first-class table: `id`, `name` (unique, case-insensitive),
`institution_id` (nullable FK → `institutions.id`, POPS-2803), `currency`
(FK → `currencies.code`, POPS-2802), `kind`, `archived_at`, `display_order`,
`entity_id` (nullable, the contacts entity a `person` account is owed
by/owes), `created_at`, `updated_at`. There is no opening-balance column of
any kind — an account's balance is always the sum of the transactions it
carries, never a stored number that can drift from that sum.

`kind` is a discriminator only. It is a plain `text` column with no SQL CHECK
constraint (the same convention `transactions.type` already uses — see
migration `0065`'s header) validated against `ACCOUNT_KINDS`
(`src/contract/account-kind.ts`) at the contract boundary. The behaviour a
kind implies — its sign convention (`asset` vs `liability`), whether it has
an external balance to checkpoint against (POPS-2750 territory), and whether
it is stored value — lives in a separate, exhaustively-checked lookup table
(`ACCOUNT_KIND_BEHAVIOURS`, `satisfies Record<AccountKind, AccountKindBehaviour>`)
keyed off the kind, not scattered across `if (kind === ...)` branches. Adding
a kind without deciding its three behaviours is a compile error.

`idx_accounts_kind_currency_cash` is a partial UNIQUE index on
`(kind, currency)` scoped to `kind = 'cash'`: two `cash` accounts in the same
currency are indistinguishable (both are just "the currency's physical
cash"), but two `credit-card` accounts in the same currency are legitimately
different cards and must stay legal.

`transactions.account_id` is a `NOT NULL` FK onto `accounts.id`, backfilled
by matching the existing free-text `transactions.account` against
`accounts.name`; an unmatched string fails the migration rather than
silently dropping the row or landing a NULL. `transactions.account` itself
stays — untouched, still written and read — until POPS-2770 removes it once
backend reads have moved over incrementally.

## Consequences

- Every transaction has a real account to belong to, and that account carries
  real properties (institution, currency, kind, lifecycle) a free-text string
  never could.
- The account chip (POPS-2766) can render an institution's logo or a
  colour-backed initials fallback without ever parsing a bank name string.
- A rewards-points program is an account like any other — `kind: 'cash'`
  (or a future points-specific kind) with `currency` pointing at a
  `currencies` row that has no ISO 4217 code, not a special case bolted onto
  the schema.
- **Accepted trade-off:** two tables (`institutions`, `currencies`) and two
  migrations had to land before this one could, which is more schema
  surface than the ticket's original free-text scope. Judged worth it because
  the alternative — parsing bank-name strings for chip rendering, and a
  currency column that structurally cannot hold a points balance — would have
  had to be undone within the same epic anyway.
- **Accepted trade-off:** `transactions.account` (free text) and
  `transactions.account_id` (the FK) now both exist and must be kept in sync
  on every write until POPS-2770 drops the former. A write that supplies an
  `account` string matching no registered account is refused
  (`UnresolvedAccountNameError`) rather than silently accepted — this is a
  real behaviour change for the transaction-write and import-commit paths,
  not just the migration, and is called out for confirmation in the
  implementing PR rather than assumed.
