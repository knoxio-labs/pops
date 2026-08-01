# Thalamus — index and embedding sync

Keeps the SQLite index in step with the Markdown engram files and feeds the
embedding pipeline. The files are the source of truth; everything this module
writes is regenerable from them.

## From a file to a semantic hit

Four hops across three directories, and each one can no-op independently:

1. `watcher.ts` (chokidar, 500ms debounce per path) produces a path event.
2. `sync.ts` parses the frontmatter and upserts `engram_index` plus the scope /
   tag / link junctions in one transaction per file. A parse or validation
   failure skips the file entirely — nothing partial is written.

Without a watcher, only `POST /index/reindex` with `force` drives hops 2 and 3:
`IndexService.reindex` re-syncs every indexed path and then runs the trigger.
`POST /index/reconcile` builds a `FrontmatterSyncService` and nothing else, so
the paths it syncs and orphans never reach the queue.

## Switches that gate the path

A corpus can be completely indexed and still have zero semantic reach:

- `EMBEDDING_API_KEY` — absent means the worker process never starts its
  embeddings worker, so any queued job sits unconsumed.
- sqlite-vec (`../../../db/vec-loader.ts`) — a failed load leaves
  `vecAvailable` false and every k-NN call throws. `HybridSearchService.hybrid`
  catches that, warns, and returns its BM25 leg alone, but `semanticSearch()`
  and `similar()` propagate — and `similar()` is what the consolidator and
  linker in `../workers` call, so those runs reject rather than degrade.
- `CEREBRUM_INDEX_WATCH` and Redis gate the hops before that; the conditions
  are in the headers of `instance.ts`, `queue.ts` and `embedding-trigger.ts`.

## Cross-source rows

Nothing schedules `cross-source.ts`. The peer-pillar scan it performs runs only
on `POST /index/reindex-sources`.

## Deletes never delete

A watched file disappearing marks its index row `status: orphaned`, and
`reconcile` does the same for rows whose file is gone.
