# Tag Rule Proposals

Status: Shipped — the deterministic propose/preview/apply/reject contract, the
import-wizard UI, the **seed taxonomy (v1)** that primes a fresh database, and
the **Tag Rules browser** (view/edit/disable/delete + usage-history preview)
all ship. A full historical ChangeSet before/after diff (CP020 remainder) is
tracked separately at #3741.

A tag-learning system that proposes reusable **tag rules** from a user's tag edits
during import. Rules contribute tag _suggestions_ with source attribution; they
never overwrite user-entered tags and never infer entity/type. Kept separate from
classification corrections so tagging can improve without risking incorrect entity
assignment. Online-vs-in-person is just a normal tag here (a rule over
`transaction_tag_rules`), not a transaction field.

## Data model

`transaction_tag_rules` (finance DB):

- `id`, `descriptionPattern`, `matchType` (`exact | contains | regex`, default `exact`)
- `entityId` (nullable — null = global, set = scoped to one entity group)
- `tags` (JSON `string[]`), `isActive` (default true)
- `confidence` (0..1, default 0.5), `priority` (default 0)
- `timesApplied`, `createdAt`, `lastUsedAt`

`tag_vocabulary`: `tag` (PK), `source` (`seed | user`), `isActive`, `createdAt`.
Primed on a fresh DB with the v1 taxonomy as `source: 'seed'` rows (idempotent
`INSERT OR IGNORE`); `source: 'user'` rows are added by accepted-new-tag upserts
on top.

A **ChangeSet** is `{ source?, reason?, ops[] }`; ops are a discriminated union on
`op`: `add { data }`, `edit { id, data }`, `disable { id }`, `remove { id }`. Apply
runs all ops in one DB transaction (atomic — no partial ChangeSet lands).

## REST API surface (`/tag-rules/*`)

- `GET  /tag-rules` → `{ data: TagRule[], pagination }`; optional
  `matchType` / `isActive` / `minConfidence` filters, `limit`/`offset`
  pagination. Read-only — never mutates usage telemetry.
- `GET  /tag-rules/:id` → `{ data: TagRule }`; 404 on an unknown id.
- `PATCH /tag-rules/:id` — body `{ entityId?, tags?, confidence?, isActive?, priority? }`
  (mirrors the ChangeSet `edit` op shape); returns `{ data, message }`. `descriptionPattern`
  and `matchType` are immutable post-create — not accepted here.
- `POST /tag-rules/:id/disable` — soft-delete (`isActive=false`); a real, direct
  mutation (not folded into a ChangeSet). Returns `{ message }`; 404 on an unknown id.
- `DELETE /tag-rules/:id` — hard delete. Returns `{ message }`; 404 on an unknown id.
- `POST /tag-rules/:id/apply-existing` — body `{ dryRun? }`; retroactively merges
  the rule's tags into every existing transaction it matches (additive-only, skips
  `matchType: 'manual'` rows). Returns `{ data: { dryRun, matched, updated, skippedManual } }`,
  where `matched` counts every pattern-matched row and `updated`/`skippedManual` are
  sub-counts. `dryRun` computes the same set without writing or bumping usage telemetry.
  404 on an unknown id (#3660).
- `POST /tag-rules/match-preview` — body `{ pattern, matchType, limit?, offset? }`;
  returns `{ data: { matches, totalCount } }`: every DB transaction the candidate
  `(pattern, matchType)` currently matches, paged, with the true full-DB total
  (mirrors `corrections.ruleMatchPreview`). Backs the Tag Rules browser's
  usage-history panel — a first full-history preview surface for tag rules
  (`tagRules.preview` below still only samples caller-supplied transactions).
- `GET  /tag-rules/vocabulary` → `{ tags: string[] }` (active vocabulary).
- `POST /tag-rules/propose` — body `{ signal, transactions[], maxPreviewItems }`;
  returns `{ changeSet, rationale, preview }`. Deterministic (no AI): builds a
  single `add` op from a tag-edit signal (`descriptionPattern`, `matchType`,
  `entityId?`, `tags`) and previews it.
- `POST /tag-rules/preview` — body `{ changeSet, transactions[], maxPreviewItems }`;
  returns `{ counts, affected[] }` with per-transaction before/after suggested tags.
- `POST /tag-rules/apply` — body `{ changeSet, acceptedNewTags[] }`; upserts accepted
  tags into the vocabulary (`source: 'user'`), applies the ChangeSet, returns the
  full rule list. An op on an unknown id → 404.
- `POST /tag-rules/reject` — body `{ changeSet, feedback (required), signal?, transactions? }`;
  applies no changes; if a `signal` is supplied, returns a revised `followUpProposal`
  whose rationale/reason incorporate the feedback, else `null`.

`maxPreviewItems` is coerced, 1..500, default 200.

## Business rules

- Rules contribute **suggestions only** — a transaction with any `userTags` in the
  current import is skipped by the preview and never overwritten.
- Suggestions carry source attribution (`source: 'tag_rule'`, `pattern`) and an
  `isNew` flag set when the tag is absent from the vocabulary (case-insensitive).
- Matching is entity-scoped or global: a rule with `entityId` applies only to that
  entity; a null-entity rule applies everywhere. Pattern matching is
  exact / contains (case-insensitive on normalized description) / regex
  (case-insensitive, invalid patterns skipped with a warning).
- Preview is fully deterministic: reads only the supplied transactions plus the
  vocabulary; `counts` = `{ affected, suggestionChanges, newTagProposals }`.
- Rules drive tagging only — never entity/type inference.

## Import-wizard integration

- **Tag Review** offers "Save tag rule…" at two scopes, both opening
  `TagRuleProposalDialog`:
  - **Group scope** — pattern = entity name, `entityId` = the group's entity, tags
    = the union of the group's tags; accept/reject applies to the whole group.
  - **Transaction scope** — pattern = the row's description, `entityId` = the row's
    entity, tags = that row's tags; accept/reject applies to just that row.
    All confirmed transactions are passed as the preview scope.
- The dialog presents brand-new tags as checkboxes; accepting passes them as
  `acceptedNewTags` so they enter the vocabulary going forward. Rejecting requires
  a non-empty feedback message and shows any `followUpProposal` in-place.
- Approving applies the ChangeSet, stores it in the import store (committed with the
  final import), and live-updates suggested tags for the remaining non-user-edited
  transactions in the session — without touching entity/type.
- **Rule-creation step**: detects tag patterns from the import batch by grouping on
  entity (fallback: description prefix) and keeping tags occurring in ≥50% of a
  group's transactions (`Math.ceil(n * 0.5)`); proposes them as `contains` rules the
  user can select and save in one click before committing.
- Committed rules apply on every future import via `findMatchingTagRules` (active
  rules only, entity-scoped or global, exact/contains/regex), feeding the
  tag-suggester alongside correction-rule and AI tags.

## Tag Rules browser (`/finance/tag-rules`)

First-class management surface for already-created rules — closes the gap where
tag rules could only be added, never fixed or pruned in-product (#3659 / CF058).

- Lists every rule (pattern, matchType, entity, tags, confidence, priority,
  isActive, `timesApplied`/`lastUsedAt`), filterable by matchType / isActive /
  minConfidence, paginated.
- **Edit** — `TagRuleEditDialog` patches entity scope, tags, confidence,
  priority, and the active flag via `PATCH /tag-rules/:id`. `descriptionPattern`
  and `matchType` are shown read-only: they're the rule's identity key, and
  changing them means creating a new rule (delete the old one) rather than
  mutating an existing match set out from under its usage history.
- **Disable** — one-click, no confirmation (reversible via edit → Active);
  calls `POST /tag-rules/:id/disable`, a real mutation, not a client-only toggle.
- **Delete** — confirmation dialog, then `DELETE /tag-rules/:id`.
- **Apply to existing transactions** — a wand row action calls
  `POST /tag-rules/:id/apply-existing`, retroactively merging the rule's tags into
  every existing transaction it matches (#3660). No confirm dialog: the operation
  is additive-only and skips manual overrides, so there is nothing destructive to
  gate. A success toast reports how many rows were tagged.
- **Usage/history preview** — the edit dialog's side panel shows `timesApplied` /
  `lastUsedAt` telemetry plus a live `POST /tag-rules/match-preview` scan: every
  transaction in the full finance DB the rule's `(pattern, matchType)` currently
  matches, not just the current import batch. This is the tag-rule analogue of
  corrections' `ruleMatchPreview`.
- Mirrors `RulesBrowserPage`'s page-shell + sections + hooks structure
  (`pages/tag-rules-browser/`) and its own nav entry (`Tag Rules`, distinct
  from the corrections `Rules` page) rather than a tab, so each remains a
  focused route-level page over its own domain model.
- **Deferred (CP020 remainder, tracked at #3741):** a full before/after
  ChangeSet impact diff across all historical transactions (not just a raw
  match list) for an _edited_ rule. `match-preview` above covers the "what
  does this rule hit today" question (mirrors `corrections.ruleMatchPreview`,
  shipped for #3597); the "what would this edit change historically"
  question — a ChangeSet-level diff, not just current matches, over
  unlimited history rather than a capped caller-supplied batch — remains
  open for both tag rules and corrections and is a larger design decision.

## Acceptance criteria

- [x] Tag rule model matches by exact/contains/regex and proposes one or more tags
      as suggestions, never forced edits.
- [x] Bundled ChangeSet supports add / edit / disable / remove and applies atomically.
- [x] `POST /tag-rules/propose` and `/preview` return a deterministic impact preview
      scoped to caller-supplied transactions; user-tagged transactions are excluded.
- [x] Suggestions carry source attribution and an `isNew` flag against the vocabulary.
- [x] `POST /tag-rules/apply` upserts `acceptedNewTags` into the vocabulary and an
      accepted New tag is part of the vocabulary thereafter; unknown-id ops 404.
- [x] `POST /tag-rules/reject` requires feedback, applies nothing, and returns a
      feedback-revised `followUpProposal` when a signal is supplied.
- [x] Tag Review supports group-scope and transaction-scope proposals via
      `TagRuleProposalDialog`; approving live-updates remaining suggestions without
      altering entity/type.
- [x] Rule-creation step groups by entity, applies a ≥50% occurrence threshold, and
      one-click-saves selected `contains` rules before commit.
- [x] Committed rules apply to all future imports with entity-scoped and global
      exact/contains/regex matching via `findMatchingTagRules`.
- [x] Seed taxonomy (v1) primes a fresh database with `source: 'seed'` vocabulary so
      suggestions read against a populated vocabulary before any user tags exist; seeded
      via an idempotent `INSERT OR IGNORE` in the finance migration baseline.
- [x] `GET /tag-rules` / `GET /tag-rules/:id` list and fetch persisted rules
      (filterable, paginated) without mutating usage telemetry.
- [x] `PATCH /tag-rules/:id` edits entity/tags/confidence/priority/isActive;
      `POST /tag-rules/:id/disable` and `DELETE /tag-rules/:id` are real
      mutations; all three 404 on an unknown id.
- [x] `POST /tag-rules/match-preview` returns the full-DB match set (paged,
      true total) for a candidate `(pattern, matchType)`.
- [x] The Tag Rules browser (`/finance/tag-rules`) lists, filters, edits,
      disables, and deletes rules, and surfaces usage telemetry + a
      match-history preview in the edit dialog.
- [ ] Full before/after ChangeSet impact diff over unlimited history (CP020
      remainder) — tracked at #3741, not implemented here.
