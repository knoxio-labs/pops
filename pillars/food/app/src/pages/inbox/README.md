# Ingest review queue

`/food/inbox` (three tabs) and `/food/inbox/:sourceId` (the per-draft inspector).
It is not the only promote path: the Promote button on
`/food/recipes/:slug/drafts` calls `promoteVersion` directly, whose only
precondition is `compile_status='compiled'` — none of `approveDraft`'s review
guards, and no `ingest_sources.reviewed_at` stamp.

## What each tab lists

The membership rules are SQL-side and each is documented on its query:
`src/db/services/inbox-queries-drafts.ts`, `-rejected.ts`, `-failed.ts`.

The three tabs do not partition ingest sources. Approving stamps
`ingest_sources.reviewed_at`, which drops the row out of the Drafts predicate
while matching neither Rejected (needs a `recipe_version_rejections` row) nor
Failed (needs `error_code` and `error_message`), so an approved row appears in no
tab at all.

`POST /inbox/list` returns a `nextCursor`; this UI renders one page and does not
consume it.

## Approving a draft requires compiling it first

The ingest worker creates every draft with `compile_status='uncompiled'`
(`src/api/modules/ingest/ingest-worker-complete.ts`). Nothing in the approve path
compiles. The chain is:

1. `DecisionPane` disables Approve while `compileStatus !== 'compiled'`, the
   quality band is `blocked`, or the source is still processing.
2. `approveDraft` (`src/db/services/inbox.ts`) rejects an uncompiled version with
   `NotCompiled`.
3. `promoteVersion` throws `CannotPromoteUncompiledVersion` beneath that.

The inspector's only compile trigger is the editor's Save
(`inspector/EditorPane.tsx` → `recipes.saveDraft`), and that button is disabled
while the buffer still equals the stored `bodyDsl`. An untouched ingest draft
therefore cannot be compiled — and so cannot be approved — from here until the
reviewer edits the DSL text.

The `blocked`-band gate is client-side only; the server does not score quality
during approve.

## Reject, undo, re-run

Undo deletes the rejection row and returns the version to `draft`.

"Re-run pipeline" calls `POST /ingest/retry`, re-enqueuing the same `sourceId`.
It stays disabled for an `auth-dead` partial: recovery is an out-of-band Instagram
cookie refresh (`docs/runbooks/instagram-cookie-refresh.md`), not a re-queue.
