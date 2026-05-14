# US-01: Capture-First Manual Input

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: In progress

## Description

As a user in the pops shell, I want a one-input capture surface that takes my raw text and lets the pipeline figure out type, template, scopes, and tags so that adding to Cerebrum has the same friction as a sticky note — not the friction of filling a form.

## Acceptance Criteria

- [ ] The `/cerebrum` route opens a capture surface whose primary affordance is a single multi-line body editor with an optional title input — no other fields visible by default
- [ ] Submitting the body calls `cerebrum.ingest.quickCapture` and returns within 500 ms regardless of body length, with classification, entity extraction, and scope inference deferred to the curation worker (PRD-081 US-03)
- [ ] After submission, the surface immediately shows the created engram's id, file path, source (`manual`), and the fallback scope it was assigned, without blocking on async enrichment
- [ ] Empty or whitespace-only bodies are rejected client-side with an inline message and never hit the API
- [ ] The capture surface accepts paste of formatted text (Markdown, code, structured data) without losing line breaks or whitespace, matching what the normaliser stores
- [ ] An "Advanced" disclosure (collapsed by default) reveals the full explicit form: type selector, template-driven custom fields, scope picker, tag input — and submitting through Advanced calls `cerebrum.ingest.submit` so explicit values bypass classification, scope inference, and entity extraction per PRD-081 business rules
- [ ] Switching from capture to Advanced preserves any text already in the body editor; switching back collapses Advanced fields without discarding their values
- [ ] When the user opens Advanced and provides at least one of `type` / `scopes`, the form routes through `cerebrum.ingest.submit`; when no Advanced fields are touched, capture mode and `quickCapture` are used
- [ ] Cmd/Ctrl+Enter submits from anywhere in the body editor; Esc clears the body after a confirmation toast (no destructive action without an undo path)

## Notes

- This US replaces the previous form-first design. The implementation in `packages/app-cerebrum/src/components/IngestForm.tsx` and `packages/app-cerebrum/src/pages/ingest-page/*` exposes every field upfront and routes to `cerebrum.ingest.submit`. That code is the starting point but does not satisfy the new acceptance criteria — capture mode is the new default and Advanced is the disclosure.
- Capture mode does not run scope inference at submit time, so the result view does not show the `ScopeConfirmDialog`. Scope confirmation is now handled in US-07 (post-ingest review) after the curation worker completes.
- The Advanced form should reuse the existing `ScopePicker`, `TagPicker`, `TemplateFields`, and `ScopeConfirmDialog` components — capture mode is the new layer above them, not a replacement.
- The capture surface is the same component invoked by US-09 (global hotkey modal). Build it as a self-contained component that can render full-page or inside a dialog.
- The 500 ms response budget is achievable because `quickCapture` writes the engram, enqueues a BullMQ job, and returns — no LLM calls on the hot path. If Redis is unavailable, the engram is still written and the worker enqueue is logged as a warning per PRD-081 business rules.
