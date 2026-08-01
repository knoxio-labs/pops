# Import pipeline

Turns parsed bank rows into committed transactions, in two phases that are deliberately split:

- `POST /imports/process` — read-only. Dedups by checksum, then classifies each surviving row (entity + tags).
- `POST /imports/commit` — the only write. Applies rule ChangeSets, inserts transactions, re-classifies history, in one SQLite transaction.

Between them the wizard buffers every edit, entity creation and rule ChangeSet **client-side**, so an abandoned import leaves nothing behind. `POST /imports/reevaluate-pending` re-runs matching against DB rules merged with those buffered ChangeSets; `GET /imports/progress` polls a running process session.

## Classification ladder

The order is the thing to know, and no single file holds it — it spans `process-transaction.ts`, `apply-learned-correction.ts` and `entity-matcher.ts`. First hit wins.

1. **Learned corrections** (`apply-learned-correction.ts`) — active rules at or above `MIN_MATCH_CONFIDENCE`, ordered `priority ASC, id ASC`. At or above `HIGH_CONFIDENCE_THRESHOLD` → `matched`, below → `uncertain`. A **type-only** correction (transfer/income, no entity) is terminal `matched` and never falls through.
2. **Transfer/income heuristic** — short-circuits to `matched` with no entity.
3. **Aliases**, then 4. **exact** → 5. **prefix** → 6. **contains**, then 7. a **punctuation-stripped retry** of exact/prefix/contains. All of stages 3–7 live in `entity-matcher.ts`; its helpers document their own normalization and tie-breaking rules.
4. **AI fallback** (`ai-batch-resolver.ts`) — reached only after every deterministic stage misses.

Corrections outrank everything because they encode learned user intent. AI is best-effort: no configuration or provider failure ever fails an import, the row just becomes `uncertain`.

## Where things live

| Concern                                                     | File                                            |
| ----------------------------------------------------------- | ----------------------------------------------- |
| Two-pass orchestration, dedup, per-run map building         | `process-service.ts`                            |
| Per-row ladder walk and bucketing                           | `process-transaction.ts`                        |
| Stages 3–7 matching and normalization                       | `entity-matcher.ts`                             |
| Batching, chunking, and the rate-limit circuit breaker      | `ai-batch-resolver.ts`, `ai-circuit-breaker.ts` |
| Prompt construction and the field allowlist                 | `ai-categorizer*.ts`                            |
| Transactional write, rollback semantics, commit idempotency | `commit.ts`                                     |

Each of those carries a file-header comment explaining its own mechanics and the reasoning behind them. Read the header before the body.

## Rules that span files

- **Reference data is fetched once per run, never per row.** Entity names, aliases and default tags come live from the `contacts` pillar — finance keeps no entity mirror. The correction rule set is loaded once and threaded through `ProcessContext`. Entity-key normalization is cached against the lookup map's identity, so **building a map and then mutating it mid-run yields stale keys** — build a fresh one.
- **Only an allowlisted projection reaches the model.** `toCategorizerInput` drops `rawRow`, `account`, `location` and `checksum`, so no account, card or reference column can be interpolated into a prompt. Telemetry carries an opaque `import_batch:<id>`, never the description.
- **A disabled categorizer is loud, not silent.** A run where rows reached the AI stage with it switched off surfaces an `AI_CATEGORIZATION_UNAVAILABLE` warning carrying the affected count — "matched nothing because AI was off" must never look like "matched everything".
- **Tag suggestions are deduplicated and source-attributed** in the order correction → tag-rule → AI → entity-default. A tag appears once regardless of how many sources propose it. There is no online/in-person field on a transaction; that distinction is an ordinary tag applied by `transaction_tag_rules`.

## Absent

Per-bank parsing does not exist. The wizard maps CSV columns by hand for every source, and the bank selector in the upload step is cosmetic — it does not route to a parser or set the account.

Related: `../corrections/`, `../tag-rules/`, `../tag-suggester/`, `../transfers/`, and the wizard UI at `pillars/finance/app/src/components/imports/`.
