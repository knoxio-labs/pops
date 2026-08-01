# Import pipeline

Turns parsed bank rows into committed transactions, in two phases:

- `POST /imports/process` — dedups by checksum, then classifies each surviving row. It creates no transactions, but it is **not** side-effect free: every correction and tag rule that fires has its `timesApplied` and `lastUsedAt` bumped, gated on `!isPreview`.
- `POST /imports/commit` — writes the transactions themselves, applies rule ChangeSets, and re-classifies history, in one SQLite transaction.

Between them the wizard buffers edits, entity creations and rule ChangeSets client-side. `POST /imports/reevaluate-pending` re-runs matching against DB rules merged with that pending set; `GET /imports/progress` polls a running process session.

## Classification ladder

`classifyWithoutAi` runs two stages and then defers to AI; the middle of the ladder is entirely inside `entity-matcher.ts`. First hit wins.

1. **Learned corrections** (`apply-learned-correction.ts`) — active rules at or above `MIN_MATCH_CONFIDENCE`, ordered `priority ASC, id ASC`. At or above `HIGH_CONFIDENCE_THRESHOLD` → `matched`, below → `uncertain`. A rule may carry a `transaction_type` of transfer or income with no entity; it then classifies with no merchant, but it is subject to the **same confidence split** — a transfer rule below the high threshold still buckets `uncertain`.
2. **Aliases** — substring match; longest matching alias wins.
3. **Exact** — description equals an entity name.
4. **Prefix** — description starts with an entity name; longest name wins.
5. **Contains** — entity name anywhere in the description; longest name wins.
6. **Punctuation-stripped retry** of stages 3–5. Aliases are not retried.
7. **AI fallback** (`ai-batch-resolver.ts`) — only once every deterministic stage has missed.

Stages 2–6 live in `entity-matcher.ts`, whose helpers document their own normalization, minimum-length guards and tie-breaking.

AI is best-effort: no configuration or provider failure ever fails an import, the row just becomes `uncertain`.

## Where things live

| Concern                                                     | File                                            |
| ----------------------------------------------------------- | ----------------------------------------------- |
| Two-pass orchestration, dedup, per-run map building         | `process-service.ts`                            |
| Per-row ladder walk and bucketing                           | `process-transaction.ts`                        |
| Stages 2–6 matching and normalization                       | `entity-matcher.ts`                             |
| Batching, chunking, and the rate-limit circuit breaker      | `ai-batch-resolver.ts`, `ai-circuit-breaker.ts` |
| Prompt construction and the field allowlist                 | `ai-categorizer*.ts`                            |
| Transactional write, rollback semantics, commit idempotency | `commit.ts`                                     |

Each carries a file-header comment explaining its own mechanics. Read the header before the body.

## Rules that span files

- **Reference data is fetched once per run, never per row.** Entity names, aliases and default tags come live from the `contacts` pillar — finance keeps no entity mirror. The correction rule set is loaded once and threaded through `ProcessContext`. Entity-key normalization is cached against the lookup map's identity, so **building a map and then mutating it mid-run yields stale keys** — build a fresh one.
- **Processing mutates rule telemetry.** Because `process` bumps usage counters, re-running it over the same batch — which the wizard does on resume, and on any dead-session recovery — inflates `timesApplied` for every rule that fires. Preview paths pass `isPreview` precisely to avoid this.
- **Tag suggestion runs after matching**, in `../tag-suggester/` — its header documents the source priority and dedup.

## Absent

There is no per-bank parsing (POPS-29). The wizard maps CSV columns by hand for every source, and `parseDate` / `parseAmount` ignore the selected bank entirely. The bank selector is **not** inert, though: its value is stamped onto every row as `account` and persisted to `transactions.account` at commit, so changing it changes committed data.

Related: `../corrections/`, `../tag-rules/`, `../tag-suggester/`, `../transfers/`, and the wizard UI at `pillars/finance/app/src/components/imports/`.
