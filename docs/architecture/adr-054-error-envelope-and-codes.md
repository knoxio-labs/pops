# ADR-054: One error envelope, registered codes, and a request id on every failure

## Status

Accepted — 2026-09-26. Supersedes the error-body clause of ADR-033 (`{ message, code? }`).

## Context

A failure has to be reportable from the phone, which has no console. Today it is not:

- Ten TS pillars each redeclare `{ message, code?, messageKey? }` and copy their own `HttpError`/`error-mapping.ts`; `code` is usually the thrown class's `name`, so renaming a class changes the wire. design, orchestrator, mcp and documents answer `{ error: string }` instead.
- Only bfm, finance and purchases reshape ts-rest's request-validation 400; everywhere else the raw `ZodError` goes out, contradicting each pillar's own OpenAPI. No pillar has a final error handler or (except purchases) a JSON 404, so anything unmapped is Express's HTML page. nginx answers its own HTML 502/504. contacts puts `sqlx` error text in `message`.
- bfm reclassifies every upstream failure into its own code and keeps the producer's code only inside `message`.
- No request id exists anywhere, so a reported failure cannot be tied to a log line.
- iOS discards non-2xx bodies and reads only the status; no error type conforms to `LocalizedError`; there is no shared presenter. The web toasts only network loss globally and leaves every HTTP failure to per-feature handlers, which often drop it.

## Options Considered

| Option                                                           | Pros                                                                                                                         | Cons                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Flat envelope `{ code, message, requestId, retryable, details }` | Every existing reader (SDK `mapHttpFailure`, contacts, bfm's `MobileUpstreamError`) already reads top-level `message`/`code` | Top level is shared with success-shaped `{ message }` bodies |
| Nested `{ error: { … } }`                                        | Unambiguous                                                                                                                  | Breaks every reader in one coordinated change                |
| Numeric codes                                                    | Short                                                                                                                        | Meaningless without a lookup table                           |
| Dotted lowercase codes                                           | Matches `operationId` and scope conventions, self-describing                                                                 | Longer to read aloud                                         |

## Decision

**Every service answers every failure with the same flat envelope, a registered dotted code, and a request id.**

```json
{
  "code": "inventory.codes.name_required",
  "message": "Name the item before asking for a code.",
  "requestId": "01JB7Q3Z…",
  "retryable": false,
  "details": { "issues": [{ "path": "name", "message": "Required" }] }
}
```

- `code` is `<pillar>.<area>.<reason>`, declared once per pillar in its contract with its status, retryability and default message, emitted into OpenAPI as an enum. A code is never renamed, reused or removed. Gateway codes use `gateway.`; codes a client mints for failures with no response use `ios.` / `web.` (`ios.net.offline`, `ios.net.timeout`, `ios.decode.failed`).
- `message` is written for the user and safe to render verbatim. Diagnostics (stacks, SQL, upstream detail) go only to logs, keyed by `requestId`.
- `requestId` is minted at the edge (nginx `$request_id`) or by the first pillar that sees none, returned as `X-Request-Id` and in the body, forwarded by the pillar SDK, and attached to every log line.
- One shared server lib owns the error class, the registry helper, request-id middleware, the ts-rest validation handler, the JSON 404 and the final handler; an unmapped throw becomes `<pillar>.internal` (500). contacts mirrors it in `api.rs`. nginx `error_page` answers `gateway.upstream_unavailable` as JSON.
- bfm keeps `bfm.*` codes for its own faults and relays a producer's `code`, `message` and `requestId` unchanged, with `upstream: { pillar, status }`.
- Clients build one error value `{ code, message, requestId, retryable, kind }` and one "copy details" text (code, message, request id, operation, time, build). The web toasts every failed mutation from the global `MutationCache` unless the mutation sets `meta.errorHandled`. iOS decodes the envelope on every non-2xx, presents a failed user action as a banner (message plus code) that opens a detail sheet with Copy, and keeps the last 50 failures in a persisted Recent errors list in Settings.

## Consequences

- "I got `inventory.codes.name_required`, request `01JB…`" is a complete bug report: the code names the branch, the id finds the trace in Loki.
- Existing branch-on codes (`purchase_locked`, `purchase_stale`, `client_too_old`, `resync_required`, `invalid_cursor`) are renamed to the dotted form in the same change as every client that branches on them.
- A CI guard rejects an unregistered code, a removed or renamed code, and a class name used as a code.
- A user-initiated action on iOS may not discard its error with `try?`; a background failure goes to Recent errors and inline state rather than a banner.
- The web gives up per-feature silence as a default: a feature that renders its own error must say so with `meta.errorHandled`.
- Rollout is tracked as POPS-4873.
