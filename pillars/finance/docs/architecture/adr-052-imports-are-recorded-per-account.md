# ADR-052: Imports are recorded per account

## Status

Accepted — 2026-09-06. Extends [ADR-050](./adr-050-accounts-as-first-class-records.md)
(what an account is) and [ADR-051](./adr-051-balances-are-checkpoint-anchored.md)
(what a balance is) with how an account is fed.

## Context

Importing has been a property of the upload, not of the account. The wizard
takes a file, the picked dialect parses it, the rows commit. The only trace
an import leaves is `import_commits.commit_key`, which names a click, and the
only "when was this account last fed" the pillar can answer is a ledger-wide
`MAX(transactions.last_edited_time)` on `GET /health`.

That cannot say that Amex is current and ANZ is a month behind. It cannot say
which accounts are fed by hand, which by a file drop and which — once the Up
Bank API client exists — by a fetch nobody has to remember to run. It cannot
tell a statement document (POPS-2752) which rows came out of it. And nothing
links a transaction to the import that wrote it, so none of this can be
reconstructed after the fact.

## Options considered

| Option                                                                                                         | Pros                                                                                       | Cons                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Columns on `accounts` (`import_source`, `last_imported_at`, …)                                                 | No new table                                                                               | Puts operational state on the row ADR-050 kept to identity; `last_imported_at` is a stored number that drifts from the batches it summarises; nothing per import survives |
| Derive everything from `import_commits` + transactions                                                         | No schema change                                                                           | A commit names no account, and a transaction names no commit; the join does not exist, and adding it forwards is this ADR anyway                                          |
| `account_import_config` (how an account is fed) + append-only `import_batches` (what each import did) — chosen | Every question above has a row that answers it; nothing is stored that a read could derive | A batch is one more thing the commit writes; history imported before this ADR has no batch and readers must say so                                                        |

## Decision

**An account owns its import configuration in its own table.** One row per
account in `account_import_config`, or none for an account fed by hand: the
source kind, the dialect or parser or provider, the provider's own id for the
account, an expected cadence, and the _name_ of the secret holding a
provider token. It is a table rather than columns on `accounts` because `kind`
is a discriminator and nothing more; how transactions reach an account changes
for different reasons than what the account is.

**Secrets are named, never stored.** `secret_ref` is the name of a docker or
environment secret. The token is read from `<secret_ref>_FILE` or the
environment at sync time, exactly as `UP_WEBHOOK_SECRET_FILE` already is, and
is never written to this database or shown by any surface.

**Every commit records what it wrote, per account, in `import_batches`.** The
grain is (account, commit): a commit spans accounts once a row is retargeted in
review, and a batch that named a commit and not an account could not answer
"when was this account last fed". A batch carries the source, the row count,
the inclusive date span, the parser version and the checkpoint its source
minted (ADR-051, POPS-2882). It is written inside the commit's transaction,
after every row and checkpoint has landed, so it counts what is actually
there.

**A batch may be empty.** An API sync that found nothing new writes a batch of
zero rows: the account was checked, and that is what a staleness signal needs
to know. A file import whose every row failed to write gets no batch, because
that is not the same fact.

**Batches are append-only.** No update primitive, no delete primitive. Undoing
an import is a transaction-level operation, and the batch stays true as the
record of the attempt.

**Every transaction a commit writes names its batch** in
`transactions.import_batch_id`. This is the forward link a statement document
will need to trace a row to the file it came from, and the join that makes a
batch's row count checkable.

**There is no backfill.** Nothing links a transaction committed before this
ADR to the commit that wrote it, so a batch minted from `import_commits` would
have to invent an account and a span. History imported before this ADR has no
batch. A reader asked "when was this account last fed" for such an account
falls back to the transactions themselves and says which basis it used.

**Cadence is derived, never stored.** How often an account is fed is a
function of the gaps between its batches, computed on read (POPS-2917) and
consumed by the staleness nudge (POPS-2890). `expected_cadence_days` is an
operator override, null by default.

## Consequences

- `GET /health`'s ledger-wide staleness flag stays as the ops signal. The
  per-account signal is a different question with a different threshold, and
  lives on the data-quality nudge feed.
- A commit's result now lists the batches it wrote, the same way it lists the
  checkpoints it minted, and a replayed `commitKey` returns the recorded
  batches rather than writing new ones.
- The account merge repoints batches onto the survivor, as it does
  transactions and checkpoints. A commit that spanned both accounts leaves the
  survivor two batches under one commit key; that is the truth of what
  happened, and it is why there is no unique index on (account, commit_key).
- The commit payload gained an optional `source`. A client that omits it still
  commits; the batch then carries the kind the rows imply, and that inference
  lives at the one seam that has to tolerate an old client.
- The Up Bank API client (POPS-30) and its scheduler (POPS-2921) have a row to
  read the mapping and the secret name from, and a row to write on every run.

## Implementation

`account_import_config` and `import_batches` (migration `0093`, schema
`src/db/schema/account-import-config.ts` and `src/db/schema/import-batches.ts`),
data access in `src/db/services/account-import-config.ts` and
`src/db/services/import-batches.ts`, the commit phase in
`src/api/modules/imports/commit-batches.ts`. Epic POPS-2751.
