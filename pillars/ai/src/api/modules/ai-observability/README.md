# AI observability

The read model over `ai_inference_log` — the single table every model-calling
pillar writes to through the ingest. `stats` and `quality` are `GROUP BY` over
the raw log at query time; `latency` selects the raw `latency_ms` values and
computes its percentiles in Node; `history` merges a per-day rollup of the log
with the pre-aggregated `ai_inference_daily`. All are filtered conjunctively by
provider / model / domain / operation / date.

## Gotchas that span the endpoints

- **The latency filters differ per endpoint.** `latency` computes its
  percentiles and `avg` over `latency_ms > 0 AND status = 'success' AND
cached = 0`; `quality`'s `averageLatencyMs` drops the status predicate, so it
  averages `error`, `timeout`, and `budget-blocked` rows in as well.
  `slowQueries` is successful calls above 2× the window's P95, capped at 20.
- **"Error" means two different things.** A number from one endpoint will not
  match the other by construction, not by bug.
- **`domain` is nullable, and null is spelled `general`.** The `byDomain`
  grouping COALESCEs null to the literal `general`, and passing
  `domain=general` as a filter is translated back to `domain IS NULL`.

## The summary cache is write-only

`runSummary` computes a 30-day envelope and persists it to the
`ai.observabilitySummary` setting. Nothing reads that key — no endpoint, no
handler, and not the dashboard, which always calls `/ai-observability/stats`
live. Treat it as a staged optimisation, not a load-bearing cache.
