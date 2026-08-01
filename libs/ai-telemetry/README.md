# @pops/ai-telemetry

The client side of cross-pillar AI telemetry. A pillar that calls Claude wraps the call in `callWithLogging` (or `callWithLoggingStream`) and gets usage, cost, latency and errors reported to the `ai` pillar's `POST /ai-usage/record` ingest — fire-and-forget, off the hot path.

The wire shape is `InferenceRecordSchema` in `src/record-schema.ts` — read that file's header.

## Who depends on it

**Producers** — pillars that wrap Claude calls:

| Pillar     | Call sites                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cerebrum` | ego, ingest, query, emit, workers, nudges — the widest user, and the only consumer of `callWithLoggingStream` (ego SSE, query SSE)                                            |
| `food`     | `worker/ai/anthropic-client.ts`, plus `handlers/extract-with-claude.ts`, `handlers/web-llm-extract.ts`, `handlers/instagram/vision.ts`, `handlers/instagram/text-fallback.ts` |
| `finance`  | Import AI categorizer (`modules/imports/ai-categorizer-api.ts`) and the corrections AI runtime (`modules/corrections/ai-runtime.ts`)                                          |

**Schema consumers:**

- `pillars/ai/src/contract/rest-ingest.ts` imports `@pops/ai-telemetry/record-schema` and uses it verbatim as the ingest body. It is the sink, not a caller.
- `pillars/food/src/worker/ai/backfill-mapping.ts` imports `InferenceRecordSchema` to validate rows mapped from food's historical log. Its driver, `pillars/food/scripts/backfill-ai-inference.ts`, POSTs to the ingest with its own `fetch` and the `ops-backfill` credential — a second producer of `ai_inference_log` rows that never touches this wrapper.

That direction is the thing to internalise: the wire schema lives in this lib and the owning pillar imports it, not the reverse.

## Constraints

- **The record shape is a stable cross-pillar contract under [ADR-040](../../docs/architecture/adr-040-cross-pillar-contract-discipline.md).** Adding an optional field is free. Renaming or removing a field, changing the status enum, or tightening a previously-optional field is breaking: dual-accept for a deprecation window, update every emitter, then remove.
- **`libs/pops-ai` is a hand-maintained Rust twin of this schema.** Any wire change must be replayed there by hand, including its golden fixture. Nothing enforces it — see that crate's README.

## What first-time consumers get wrong

- **`cached` is not reportable.** The schema carries it and the `ai` pillar's dashboard splits cached from uncached, but `InferenceContext` has no `cached` field and all four emit sites hardcode `cached: false`. A caller cannot report a cache hit through this wrapper.
- **A `costUsd: 0` row is ambiguous.** `computeCostUsd` returns a `missing` flag to separate "free" from "unpriced", but the wire record has no field for it, so the log cannot tell the two apart.
- **Streaming reports only after the generator drains.** Break out of the `for await` early and no record is ever emitted; there is no `finally`.
- **`deps.warn` tells you nothing on the default path.** `makeFire` only calls `warn` if `report` rejects, and the default `createEnvReportSink` never rejects: it swallows a thrown fetch into its own `onError` hook (which neither wrapper supplies) and never inspects `response.ok`. To observe a failed report you must inject your own `report`.
- **`costCapUsd` on `InferenceContext` is carried but never enforced** — see its JSDoc in `src/types.ts` and `pillars/ai/src/api/modules/ai-budgets/README.md`.
