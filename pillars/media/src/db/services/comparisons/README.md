# Ranking engine

Pairwise ELO over user-defined taste dimensions. Two surfaces feed the same tables: the **arena** (one pair at a time, `pairs/`) and the **tier list** (a whole board at once, `tier-list-selection.ts` → `tier-conversion.ts` → `submit-tier-list.ts`). Rankings and the detail-page radar read out of `media_scores`.

Every file here carries a header describing its own mechanics. What follows is only what no single file can state.

## Selection is movies-only, reading is not

`media_type` columns exist on `comparisons`, `media_scores`, `comparison_staleness` and `tier_overrides`, and the wire enum is `'movie' | 'tv_show'`. Both candidate pools hardcode movies: `fetchWatchedMovies` (`pairs/smart-pair-fetch.ts`) filters `watch_history` to `media_type = 'movie'`, and `tier-list-selection.ts` joins `movies` under `ms.media_type = 'movie'`. So neither surface can ever offer a TV show to compare.

The rankings read path is media-type-agnostic, though: `rankings.ts` and `rankings-overall.ts` LEFT JOIN `tv_shows`, coalesce the title to `tv.name` and the year to `tv.first_air_date`, and only constrain `media_type` when the caller passes one; `resolvePosterUrl` (`rankings-helpers.ts`) returns a `/media/images/tv/…` poster for non-movie rows. A `tv_show` row in `media_scores` therefore renders in the rankings list with title, year and poster. Such a row is reachable: `RecordComparisonBody` accepts the full `'movie' | 'tv_show'` enum and `getOrCreateScore` creates a row for whatever type it is handed. Nothing that exists today sends one — the arena hooks and `submit-tier-list.ts` all pass the `'movie'` literal.

## Two eligibility pools, two predicates

The arena and the tier list disagree about who is eligible, and the difference is easy to trip over:

|                    | Arena (`pairs/smart-pair-fetch.ts`)                           | Tier list (`tier-list-selection.ts`)             |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------ |
| Base set           | `watch_history` rows with `completed = 1 AND blacklisted = 0` | rows in `media_scores` for that dimension        |
| Blacklist rule     | needs **at least one** non-blacklisted completed watch        | excluded if **any** blacklisted watch row exists |
| Never-scored movie | included at the baseline score                                | absent — there is no row to select               |
| Staleness          | a weight in the pair score, never a cutoff                    | a hard cutoff below `stalenessThreshold`         |
| Watchlist          | filtered out, unless that leaves fewer than 2                 | not considered                                   |

So a movie can be arena-eligible and tier-list-invisible at the same time, and a single bad watch event removes it from tier lists while leaving it in the arena.

## Recording is not append-only

`batch-record.ts` ranks comparison sources — `arena` (2) > `tier_list` (1) > historical/null (0). When a pair already has a comparison on that dimension, the incoming one **replaces** it at equal-or-higher rank and is **skipped** otherwise. A tier-list round therefore silently drops pairs the user already settled in the arena, and the skipped count is the only signal.

## What triggers a full replay

`recalcDimensionElo` (see its JSDoc in `score-management.ts`) is not a rare maintenance path. It runs from `insertOverride` and `deleteComparison` (`comparisons.ts`), `blacklistMovie` — once per affected dimension — `excludeFromDimension` (`dimension-exclusion.ts`), `batchRecordComparisons` after an override, and `recalcAllDimensions`.

## What decays, what purges

- **Staleness** (`staleness.ts`) is per movie, not per dimension, and it only ever deprioritises — nothing is excluded by staleness in the arena. The `resetStaleness` call the header mentions lives outside this directory, in `../watch-history-log.ts` and `../watch-history-batch.ts`.
- **Skip cooloff** (`skip-cooloff.ts`) suppresses a pair until the global comparison count advances by 10. Pair keys are order-normalised, and expired rows are ignored at query time rather than cleaned up, so the table only grows.

Cooloffs are applied while scoring candidate pairs, not while building the candidate set. When every pair is on cooloff, `pairs/smart-pair.ts` falls back to the first two candidates — which may itself be a cooled-off pair.

## Where things live

| Concern                                  | File                                        |
| ---------------------------------------- | ------------------------------------------- |
| Record / delete / blacklist              | `comparisons.ts`                            |
| ELO application and dimension replay     | `score-management.ts`, `elo-calculator.ts`  |
| Source precedence and batch transactions | `batch-record.ts`                           |
| Two-stage pair pick, scoring formula     | `pairs/smart-pair*.ts`                      |
| Greedy new-pair coverage for a board     | `tier-list-selection.ts`                    |
| Placements → implied comparisons         | `tier-conversion.ts`, `submit-tier-list.ts` |
| Derived confidence, wire mappers         | `mappers.ts`                                |
