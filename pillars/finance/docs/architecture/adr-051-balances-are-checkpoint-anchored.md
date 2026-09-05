# ADR-051: Balances are checkpoint-anchored

## Status

Accepted — 2026-09-05. Supersedes one sentence of
[ADR-050](./adr-050-accounts-as-first-class-records.md): "an account's balance
is always the sum of the transactions it carries, never a stored number that
can drift from that sum."

## Context

That sentence is only true of an account whose transaction history is complete
from the day it opened. None of ours are, and none of them ever will be — a
CSV export starts wherever the bank's export window starts.

Summing today gives net flow, not balance. Amex reads −$18,565.36, which is
the total of everything imported rather than what is owed. The ANZ credit card
reads **+**$780.64, positive only because its import begins on 2026-06-01,
partway through the account's life; the sign is an artefact of where the file
started.

The goal this epic exists for is to open the real banking app, read the
balance, and have POPS agree — and to treat a disagreement as a signal that
rows are missing, duplicated or mis-signed. That needs a number the ledger can
be checked against, supplied from outside the ledger.

## Options considered

| Option                                                                | Pros                                                                                                                                                                      | Cons                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts.opening_balance_cents` + `opening_balance_as_of`            | Two columns, no new table; the sum is a pure function of the account row and its transactions                                                                             | Only ever answers one question, at one date; a balance read off the app today has nowhere to go; there is no way to notice the ledger drifting, because there is nothing later to compare it against |
| A stored `accounts.balance_cents`, written on every transaction write | Reads are free                                                                                                                                                            | The exact drift ADR-050 refused: two descriptions of one fact, and nothing that can be trusted to keep them in step across an import, a merge, a correction and a delete                             |
| An append-only `account_checkpoints` table (chosen)                   | Every authoritative reading is recordable, the earliest one _is_ the opening balance, and any two adjacent rows form a testable claim about the transactions between them | A balance is a query rather than a column; a date without a nearby checkpoint is only as good as the nearest one                                                                                     |

## Decision

**A balance is the nearest checkpoint plus the transactions between it and the
date asked for.** A checkpoint is `(account, date, balance)` read off something
outside the ledger: the banking app, a statement, a count of the wallet.

**There is no opening-balance column, ever** — not on `accounts`, not on
`account_checkpoints`. The earliest checkpoint _is_ the opening balance; a
dedicated column would be a second, worse spelling of the same row, and would
need its own rule for what happens when an earlier one turns up.

**Every account kind takes checkpoints.** A card is checked against its
issuer, a wallet is counted. `hasExternalBalance` chooses the wording on
screen, not whether the feature exists.

**Checkpoints are end-of-day.** Every transaction dated `<= as_of` is inside
the balance. `transactions.date` carries no time and no posting date, so a
finer boundary would be a fiction. This is also why reconciliation targets
today's live balance rather than a statement's closing balance: a statement
boundary is permanently off by whatever straddles it. A statement's closing
balance still becomes a checkpoint — it is simply expected to disagree until
the straddling rows land.

**Every stored figure is ledger-signed**: positive is money held, negative is
money owed, for assets and liabilities alike, exactly as
`transactions.amount_cents` already is. A card owing $2,137.55 stores
`-213755`. "Amount owed" is a translation the UI performs at its edge.

**Three sources: `manual`, `import`, `statement`.** Anything authoritative
mints one — typed by hand, read off the file an importer was already parsing
(POPS-2882), or parsed out of a statement document (POPS-2752). A partial
unique index on `(account_id, as_of, source) WHERE source != 'manual'` means
re-importing the same file cannot double a checkpoint, while a second hand
count on the same day stays legal: it is a new fact, and the newest
`created_at` wins.

**Checkpoints are never edited.** The table is append-only and ships with no
update primitive; a corrected count is a new row. Only `manual` rows may be
deleted, and only so a typo has a way out — deleting a machine-sourced row
would just invite the next import to mint it again.

**Disagreement is computed on read, never stored.** A checkpoint's expected
balance is the previous checkpoint plus the transactions between the two; the
delta is the difference. Adding the missing transaction later must clear the
flag with no write to the checkpoint, so there is nothing to keep in step.
Only the _latest_ checkpoint's delta makes an account read as inconsistent —
an older flagged checkpoint followed by a consistent newer one has been
re-anchored, and the account is no longer in question.

**The `account_id` foreign key cascades on delete**, alone among this pillar's
foreign keys. The only hard delete of an account is the merge path, which
repoints these rows before it deletes (POPS-2883); the cascade is the backstop
for a delete arriving some other way, because a checkpoint for an account that
no longer exists would make the anchor lookup answer for a ghost.

## Consequences

- `accounts` still has no balance column, so ADR-050's actual concern — one
  fact with two descriptions that can drift — is untouched.
- A balance is a query. It has three bases, and the wire says which: anchored
  forwards from a checkpoint, anchored backwards from the next one (which is
  what makes a twelve-month trend truthful before the first checkpoint), or —
  only when an account has no checkpoint at all — a plain sum, which is net
  flow and is labelled as such.
- Transactions dated before the earliest checkpoint no longer move the current
  balance. That is the point of anchoring, and it is what stops a backfill of
  old history from silently changing today's number.
- An account with no checkpoint is no worse off than it was before this ADR,
  and the UI can say so honestly instead of showing a number that looks
  authoritative.
- A statement import that disagrees is expected, not alarming, until its
  straddling rows arrive. The wording on screen has to carry that.

## Implementation

`account_checkpoints` (migration `0092`, schema
`src/db/schema/account-checkpoints.ts`), data access in
`src/db/services/account-checkpoints.ts`, balance maths in
`src/db/services/account-balance.ts` (POPS-2879). Epic POPS-2750.
