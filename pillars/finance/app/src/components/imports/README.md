# Import wizard

Eight steps that turn a bank CSV into committed transactions. Unlike the backend modules it drives, almost none of this directory carries file-level docs, so this is the orientation.

| #   | Step    | What happens                                                                                                                             |
| --- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Upload  | Pick a file and a bank. The bank does not select a parser, but it **is** stamped onto every row as `account`.                            |
| 2   | Map     | Map CSV columns to date / description / amount / location; parse client-side into `ParsedTransaction[]` with a SHA-256 checksum per row. |
| 3   | Process | `POST /imports/process` — dedup by checksum, then classify. Long-running, so the step polls `GET /imports/progress`.                     |
| 4   | Review  | Resolve `uncertain` rows: assign entities, correct matches, trigger correction proposals.                                                |
| 5   | Tags    | Review suggested tags per entity group or per transaction.                                                                               |
| 6   | Rules   | Confirm the tag-rule ChangeSets this import would create.                                                                                |
| 7   | Commit  | `POST /imports/commit` — writes the transactions and applies every buffered ChangeSet.                                                   |
| 8   | Summary | Counts for what was committed.                                                                                                           |

## Local-first is the whole design

No transaction and no rule is written before step 7. Every entity creation, correction ChangeSet and tag-rule ChangeSet accumulates in `../../store/importStore` as _pending_ state, and re-evaluation runs against DB rules merged with that pending set — so the user sees the effect of a rule before it exists. Abandon the import and no rule was ever created, which is why one made during review does not appear in the rules browser until commit.

"Nothing is written" is not literally true, and the exceptions bite. Rejecting a correction proposal in step 4 persists rejection feedback to finance's settings table immediately. And every `POST /imports/process` — including the re-runs the wizard fires on resume or dead-session recovery — bumps `timesApplied` on every rule that matched.

## What survives a reload

The store persists to IndexedDB (`pops-finance` / `import-wizard`) with a 7-day TTL, and the wizard offers to resume. `../../store/import-store-persistence.ts` documents the mechanics — the explicit field pick, the version-bump-discards rule, and how the resume step is clamped to what the persisted state can actually support.

The consequence worth knowing here, because it spans the store and step 1: **the `File` handle is deliberately not persisted**, since it is not serializable. On resume there is no file to compare against, so re-selecting even the byte-identical CSV reads as a new file and cascades a downstream reset over the work the resume just restored.

Two more sharp edges in the same area: resuming mid-processing always restarts `POST /imports/process` rather than re-attaching to a server session that may still be alive, and two tabs editing the same import race on the persisted slot with last-writer-wins.

## Where things live

| Concern                                                                       | Directory                                            |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| Correction proposal dialog — ops list, detail editor, impact panel, AI helper | `correction-proposal/`                               |
| Review step and its per-transaction surfaces                                  | `review/`, `transaction-card/`, `transaction-group/` |
| Column mapping and client-side parsing                                        | `column-map/`                                        |
| Tag review and the tag-rule dialog                                            | `tag-review/`, `tag-rule-dialog/`                    |
| Commit step                                                                   | `final-review/`                                      |
| Data fetching, mutations, derived state                                       | `hooks/`                                             |
| Description normalization, correction helpers, preview scoping                | `lib/`                                               |

`correction-proposal/` is the largest surface here by a wide margin; the backend contract it drives is documented in `pillars/finance/src/api/modules/corrections/`.
