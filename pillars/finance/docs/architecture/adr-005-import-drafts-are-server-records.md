# Finance ADR-005: Import drafts are server records

## Status

Accepted — 2026-09-10. Extends [finance ADR-003](./adr-003-imports-are-recorded-per-account.md)
(how an account is fed) with where an import lives before it is committed.

## Context

An import is the one place in finance where a person makes forty decisions in
a row, and until now those decisions lived in one browser's IndexedDB: a single
row with a seven-day TTL, discarded silently when the persisted shape changed.
Close the laptop and open the phone, and the draft is not there. Deploy a shape
change and it is gone with nobody told. The only way back in was a dialog that
appeared when the wizard happened to be opened in the same browser.

At the same time the Up Bank webhook and scheduler write rows into the ledger
unattended, as a batch of one, so transactions land that nobody has reviewed
and the person who would review them has nowhere to find them.

## Options considered

| Option                                                               | Pros                                                 | Cons                                                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Keep IndexedDB, mirror it to the server                              | No client change to the store                        | Two copies with no arbiter; the version-mismatch discard stays; the bank's rows still have no home                  |
| Reuse `import_sessions` as the draft                                 | A table already exists                               | It holds a process run's progress with an expiry and is swept; a person's decisions are neither transient nor a run |
| One `import_drafts` table, the server copy is the only copy — chosen | One truth; a card on any device; a home for arrivals | The open tab has to write through on every change, and two tabs can now open one draft, which needs an owner        |

## Decision

**A draft is a server record and there is no other copy.** The wizard writes
`import_drafts` through on every step change; IndexedDB persistence is removed,
not mirrored. The row carries the wizard's state as JSON plus the counts and
span a card needs, so listing pending imports never parses a payload.

**Drafts do not expire.** A row leaves the table by commit or by discard. The
file is not stored: discarding a file draft means uploading it again, and
discarding a live draft costs nothing because the provider resends.

**`unusable` is a verdict, not a state.** The payload is stamped with the shape
version it was written under. A read compares that with the running build's
constant and, failing that or finding the account archived, reports the draft
as unusable with the cause. Nothing is stored and nothing migrates: a deploy
that bumps the version needs no data change, and the only action offered is
Discard.

**Two stored states, and a live draft belongs to the bank.** `live` is a draft
only the provider has touched; there is at most one per account, enforced by a
partial unique index, so arrivals have exactly one place to go. The moment a
person claims it, it becomes `saved` and never changes under them; whatever
arrives after that collects in a new `live` draft. `open` and `left-open` are
derived from the ownership columns on read.

**Ownership is a lease, not a lock.** A tab claims the draft, heartbeats while
mounted, and releases on close. A write or heartbeat from a token that is not
the owner is refused. A claim replaces an owner not heard from for a day
without asking, and replaces a live one only when forced, which is the card's
"Take over". A release from a token that no longer holds the lease is ignored,
so a tab closing late cannot evict the one that took over.

## Consequences

- Reload at any step, on any device, returns to that step with the same
  state; clearing site data loses nothing.
- Rows from a live provider wait in a pending import and reach the ledger only
  through a commit. The unattended commit path stays only for settling rows
  already in the ledger.
- A shape change is a one-line constant bump and a card that says so. It is
  also a draft lost, so the constant moves only when the payload genuinely
  cannot be read.
- A second tab on the same draft is told, not silently overwritten.
