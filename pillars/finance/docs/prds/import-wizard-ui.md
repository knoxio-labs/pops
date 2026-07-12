# Import Wizard UI

Status: Partial — the full 8-step wizard ships and works end to end. Missing:
the `isNew` "New" marker on AI-suggested tags and per-tag accept/reject in Tag
Review (the wire carries `isNew` but the UI never renders or acts on it). Those
live in `docs/ideas/import-tag-accept-reject-and-new-markers.md`.

An 8-step wizard that ingests bank-statement CSVs into the transaction ledger:
upload → map columns → server processing → review entities → tag review →
rule creation → final review/commit → summary. Every unresolved item is
surfaced and fixed before anything touches SQLite. All entity creations, rule
ChangeSets, tag-rule ChangeSets, and tag edits are buffered in the local
Zustand store during steps 1–6; the **only** database write is `commitImport`
on step 7 (final review).

There is no online/in-person attribute anywhere in this flow — "online vs
in-person" is a normal tag applied via `transaction_tag_rules`, not a field.

## Data model (client state — Zustand `importStore`)

- `currentStep: 1..8`, sequential navigation (`nextStep`/`prevStep`/`goToStep`/`reset`).
- Step 1: `file: File | null`, `sourceFileName` (display name for the resume prompt), `bankType: 'ANZ' | 'Amex' | 'ING' | 'Up'`.
- Step 2: `headers`, `rows`, `columnMap { date, description, amount, location? }`,
  `parsedTransactions: ParsedTransaction[]` plus a content fingerprint.
- Step 3: `processSessionId`, `processedTransactions { matched, uncertain, failed, skipped, warnings? }`,
  `processedForFingerprint`.
- Buffered (steps 4–6, never written until commit): `pendingEntities[]`,
  `pendingChangeSets[]` (correction rules), `pendingTagRuleChangeSets[]`,
  `confirmedTransactions[]`.
- Step 7/8: `commitResult: CommitResult | null`.
- Changing the file or re-parsing to a different fingerprint cascades a
  `downstreamReset` so stale processed/confirmed/pending state can never leak
  into a new run.
- `manuallyResolvedChecksums` records rows the user resolved by hand so server
  re-evaluations never revert them.
- The whole wizard state (excluding `file`) persists to IndexedDB and restores
  via a Resume/Discard prompt on the import page; `currentStep` is clamped on
  resume to the deepest step whose prerequisites still hold.

`ParsedTransaction` = `{ date (YYYY-MM-DD), description, amount, account (the
selected bankType), location?, rawRow (JSON of the source row), checksum (SHA-256
of the canonical dedup key — date + amount + normalized description + bank
reference — see import-dedup-csv) }`.

## REST API surface (finance pillar, `imports.*` contract)

- `POST /imports/process` → `{ sessionId }` — start dedup + entity/type
  classification + AI fallback in the background.
- `GET /imports/progress?sessionId` → `ImportProgress | null` — poll; `null`
  means unknown/expired session.
- `POST /imports/entities` → created entity — on-the-fly entity creation during a session.
- `POST /imports/apply-changeset-reevaluate` → applies a correction ChangeSet
  atomically, then re-evaluates the session (Save & Learn approve path; 412 on conflict).
- `POST /imports/reevaluate-pending` → re-evaluate the session against merged
  (DB + pending) rules, no DB writes.
- `POST /imports/commit` → `CommitResult` — the single write path: create
  entities, apply ChangeSets + tag-rule ChangeSets, write transactions, run
  retroactive reclassification, atomically.

Entity list for the dropdowns comes from the entities/contacts read endpoints,
fetched once and cached for the review step.

## Steps & acceptance criteria

### 1. Upload

- [x] Bank radio picker (ANZ / Amex / ING / Up); help card shows bank-specific export instructions for the selection.
- [x] CSV file input, max 25 MB; parsed client-side with PapaParse (`header: true`, skip empty lines).
- [x] Validates file present, CSV non-empty, headers present; invalid files show an error and block advance.
- [x] On success stores `headers`/`rows` and advances. Bank selection drives the help copy and sets each parsed transaction's `account` (`bankType`, threaded into validation and the `/imports/process` body — #3608).
- [x] A resumed run where `file` is null but parsed rows exist is tolerated: Next advances without re-parsing and a notice explains the file is not re-attached; selecting a file starts a fresh import.

### 2. Column mapping

- [x] Auto-detects date / description / amount / location from header names; user can override each via a per-field dropdown of all headers.
- [x] Required: date, description, amount. Optional: location. Cannot advance until all required are mapped; unmapped required fields are flagged.
- [x] Preview table of the first 10 rows with mapped values.
- [x] Client-side row parsing: date `DD/MM/YYYY` → `YYYY-MM-DD`; amount strip currency, parse, invert sign (bank charges positive → expenses negative); location first line, title-cased; `rawRow` preserved as JSON; checksum = SHA-256 of the canonical dedup key (date + amount + normalized description + bank reference — #3611), not the raw row.
- [x] Invalid rows excluded; first 10 validation errors shown.
- [x] Output `ParsedTransaction[]` stored in the store.

### 3. Processing

- [x] Calls `POST /imports/process`, stores the returned `sessionId`; network failure surfaces a retry.
- [x] Polls `GET /imports/progress` every 1 s; shows current phase (deduplicating / matching), processed/total, and a live batch preview of recent items with status.
- [x] Stops polling on `completed`, stores `{ matched, uncertain, failed, skipped, warnings }`, advances.
- [x] If AI categorisation **fails** (API error), the wizard pauses at Processing with a warning banner and a manual Continue; a **disabled** categorizer is non-blocking — the wizard auto-advances and the warning banner persists on Review. In both cases affected transactions route to uncertain (not failed). Sessions self-expire (~5 min); a refresh mid-processing resumes at step 3 and restarts processing from persisted parsed transactions; an expired session during review is auto-recovered (re-process + retry), not a dead end.

### 4. Review entities

- [x] Tabs Matched / Uncertain / Failed / Skipped, each with a count badge; Skipped is read-only with a "Duplicate (checksum match)" reason.
- [x] Transaction card shows description, colour-coded amount, date, account; matched cards show entity + match-type badge; uncertain show AI suggestion + confidence; failed show the error.
- [x] Uncertain/Failed: searchable entity dropdown (from the entity list), an "Accept" shortcut for an AI suggestion, and a "Create Entity" dialog (name only, defaults to company type; conflict surfaces the existing match). Selecting/creating an entity moves the transaction to Matched.
- [x] Assigning an entity detects similar still-unresolved transactions (number-agnostic, case-insensitive cleaned-description match) and offers to apply the assignment to them.
- [x] Edit dialog: description, amount, account, entity, location, transaction type. Edits are local only.
- [x] Type override to an entity-optional type (`transfer`/`income`/`loan`/`rebate`/`tax`/`reversal`) makes the merchant optional and lets the transaction reach Matched without one; `purchase`/`refund` (and an unset type) still need a merchant. (Type-only corrections classify with no entity and are terminal — see `corrections`.)
- [x] Gate: "Continue to Tag Review" is disabled while any uncertain/failed remain and shows the remaining-count reason; enables once all are resolved.
- [x] The "Continue to Tag Review (N)" count is the number that will actually import: matched rows that still need a merchant (a `purchase`/`refund` or unset-type row with no resolved entity) are excluded from N. A non-blocking notice above the tabs states how many such rows won't import and how to fix them (assign an entity or change the type in the Matched tab). Continue stays enabled so a genuinely-unwanted row can still be skipped — but never silently.
- [x] Rule-matched transactions are badged as such, with pattern / match type / confidence in the badge tooltip and an "+N overridden" popover for lower-priority rules that also matched.
- [x] **Save & Learn**: editing or assigning opens a bundled **Correction Proposal** (see `correction-proposal-engine`) — proposed rule ops with pattern/match-type/confidence/rationale and an in-import impact preview. Approve applies the ChangeSet atomically (`/imports/apply-changeset-reevaluate`) and re-evaluates remaining transactions; Reject requires a feedback message and can generate a follow-up proposal. Rules are never changed without explicit approval.
- [x] Triggering Save & Learn (accept / create / edit) opens the Correction Proposal **immediately in a loading state** before the analysis round-trip resolves; while it generates, accept/create is blocked and the loading dialog can't be dismissed, so a second action can't clobber the window about to open.
- [x] Editing a rule-matched transaction does **not** silently override the match — it opens a Correction Proposal ChangeSet (add / edit / disable / remove rules) with the same approve/reject-and-reevaluate flow.
- [x] "Manage Rules" opens the rule manager (browse mode) for full CRUD over DB + pending rules.
- [x] If the server session has expired, re-evaluation transparently re-processes and retries; manually resolved rows are never reverted.

### 5. Tag review

- [x] Transactions grouped by entity name into collapsible sections (expanded by default) with per-group counts; transactions without an entity fall into a "No Entity" group.
- [x] Per-transaction inline `TagEditor` pre-populated with the processing step's suggested tags; autocomplete from server tags + tags typed this session; free-form entry; remove via chip ✕. Edits stored per transaction by checksum.
- [x] Suggested-tag source badges: 🤖 AI, 📋 Rule (tooltip shows the matched pattern), 🏪 Entity (entity default tags).
- [x] Group-level bulk apply and per-group "Apply Suggestions" use **merge** semantics — added to existing tags, deduplicated, never replacing individual edits. "Accept All Suggestions" available.
- [x] "Save rule…" per row offers tag-rule learning via the proposal + approval + reject-with-feedback model, scoped to tag rules (see `tag-rule-proposals`).
- [x] Advancing persists per-transaction tag edits to the session and goes to step 6 — no `/imports/commit` and no DB write here.

### 6. Create rules

- [x] Groups confirmed transactions by entity; for any group where ≥50% share the same tags, proposes a `contains` rule shown as a toggleable card (entity, pattern, tag chips, affected count), all checked by default.
- [x] "Skip" advances with no changes; "Create N rules →" pushes the selected proposals into `pendingTagRuleChangeSets` and advances. Empty state when no patterns are detected.

### 7. Final review & commit

- [x] Read-only summary of everything pending: new entities, correction ChangeSets (grouped, add/edit/disable/remove), tag-rule ChangeSets, transaction breakdown, tag-assignment count; empty state when nothing is pending.
- [x] "Approve & Commit All" calls `POST /imports/commit` (the single atomic write: entities, rules, tag rules, transactions, retroactive reclassification), with a committing indicator; on success stores `CommitResult` and advances. "Back" returns to earlier steps for edits. On success the persisted wizard copy is cleared (and other open tabs are reset).

### 8. Summary

- [x] Cards for entities created, rules applied (with add/edit/disable/remove breakdown incl. tag rules), transactions imported, and transactions failed; failed list is expandable with per-row checksum + error; retroactive reclassification count shown.
- [x] "New Import" resets the wizard; "View Transactions" navigates to the transactions list.

## Not Built (see ideas)

- The `isNew` "New" marker on AI-suggested tags and per-tag accept/reject in Tag Review — the wire carries `isNew` but the UI never renders or acts on it → [ideas/import-tag-accept-reject-and-new-markers](../ideas/import-tag-accept-reject-and-new-markers.md).

## Business rules

- Steps are sequential — you can go back but not skip ahead.
- Step 4 gates: all uncertain/failed must be resolved (assigned, or type-overridden to transfer/income) before step 5.
- Transfer/income type override makes entity optional.
- Tag bulk apply is additive (merge), never destructive of individual edits.
- Nothing is written to SQLite until `/imports/commit` on step 7; all of steps 4–6 mutate only local store state and approved-but-deferred ChangeSets.
- Backend progress entries auto-clean after ~5 minutes. Client recovery re-creates sessions on demand from persisted parsed transactions.

## Edge cases

| Case                                   | Behaviour                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| CSV with no header row                 | Upload error, advance blocked                                                                                                    |
| All transactions duplicates            | Only the Skipped tab is populated; nothing to review                                                                             |
| AI unavailable (no key / rate-limited) | Warning banner; affected transactions route to uncertain, not failed                                                             |
| AI categorizer disabled (env gate)     | Non-blocking warning banner (Processing + Review); affected rows route to uncertain with a distinct reason; wizard auto-advances |
| Create an entity that already exists   | Conflict surfaced; the existing match is suggested                                                                               |
| Browser closed mid-processing          | On return, Resume restarts processing from persisted state; no re-upload needed                                                  |

## Out of scope

- Entity matching engine internals (`entity-matching-engine`), dedup/parser
  internals (`import-dedup-csv`), correction-proposal engine internals
  (`correction-proposal-engine`), tag-rule proposals (`tag-rule-proposals`),
  local-first buffering (`local-first-import`), commit/retro reclassification
  (`final-review-commit`), rule manager/priority (`rule-manager-priority`).
  This PRD is the UI wrapper over those.
