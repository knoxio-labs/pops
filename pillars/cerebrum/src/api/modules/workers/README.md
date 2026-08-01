# Glia curation workers

Four scanners over the engram corpus — `pruner.ts`, `consolidator.ts`,
`linker.ts`, `auditor.ts`, each described by its own file header. All four
extend `WorkerBase` and return `GliaAction[]` plus processed/skipped counts.

## What the shared base does and does not cover

- `WorkerBase.listActiveEngrams()` drops `archived`, `consolidated`, and any
  engram carrying a `secret` scope segment (`shouldSkipEngram`) before anything
  is scored — but it is not the only corpus entry point. In
  `src/api/rest/workers-handlers.ts`, `getStalenessScore` passes an unfiltered
  `list({ status: 'active' })` into `computeStaleness`, `getQualityScore` reads
  any engram by id with no skip check, and `getOrphans` lists directly and has
  to re-apply `shouldSkipEngram` itself.
- No proposal crosses a top-level scope, but three separate helpers enforce
  that: `shareTopLevelScope` in `worker-base.ts` (imported only by the linker),
  `groupByTopLevelScope` in `consolidator-helpers.ts` for clustering, and the
  private `groupByTopScope` behind `buildTagSharedPairs` in
  `auditor-helpers.ts` for contradiction pairing.
- Action ids are `glia_{actionType}_{yyyymmddhhmmss}_{8hex}`, where the hex
  suffix is fresh `randomBytes` on every call. Injecting `now` therefore does
  not make a run reproducible, and `workers-handlers.ts` never injects it.

## The proposals are ephemeral

`src/api/rest/workers-handlers.ts` builds `WorkerBaseDeps` without a
`trustProvider`, so `DefaultTrustPhaseProvider` applies and every run resolves
to `propose` — with or without `dryRun`. Two consequences a reader of the worker
files would not expect:

- The `act_report` / `silent` branches inside each worker (archive, create the
  merged engram, write the link, `status: 'executed'`) are unreachable through
  the REST surface.
- `WorkerBase.createAction` builds an in-memory object; it is not
  `GliaActionService.createAction`. Nothing writes these to `glia_actions`, so
  the `run*` response body is the only place a proposal ever exists.

## Two staleness factors have no source

`pruner.ts` weights days-since-referenced (0.3) and query-hit count (0.2) into
its score, and the handler supplies no lookup for either. Both therefore
contribute maximum staleness for every engram, the "queried within 7 days resets
the hit factor" rule can never fire, and orphan detection falls back to counting
inbound links alone.

## Dependencies

`../engrams` (`EngramService`) for the corpus and `../retrieval`
(`HybridSearchService`) for similarity — the consolidator and linker are only as
good as the semantic leg. The auditor additionally takes an injected LLM
contradiction detector; a failed comparison yields an action with
`status: 'error'` rather than aborting the run. Thresholds are the
`DEFAULT_*_CONFIG` constants in `types.ts` plus module-private constants in
`pruner-helpers.ts` and `auditor-helpers.ts`.
