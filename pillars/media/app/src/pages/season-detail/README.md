# Season detail

`/media/tv/:id/season/:num`. An episode list with, on each row, controls belonging to **two systems that never talk to each other**.

## Watched and monitored are unrelated

|              | Watched checkbox                                                          | Monitor switch / downloaded dot                                |
| ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| System       | POPS `watch_history`                                                      | Sonarr                                                         |
| Owned by     | `useEpisodeWatchState.ts` → `useEpisodeToggle.ts`, `useBatchSeasonLog.ts` | `useSonarrMonitoring.ts` → `useEpisodeMonitoring.ts`           |
| Keyed by     | local `episodes.id` row id                                                | `episodeNumber`, mapped to a Sonarr episode id                 |
| Present when | always                                                                    | only when `arrCheckSeries` reports the series exists in Sonarr |

Marking an episode watched does not unmonitor it, and unmonitoring does not mark it watched. The two hooks are composed side by side in `useSeasonDetailModel.ts` and share nothing but the row they render on.

`:num` is a `seasonNumber`, not a season row id. The season object is found by scanning the show's seasons list — there is no fetch-season-by-id call — so the episodes query stays disabled until the seasons list resolves.

## The shared watch-history query key

Watch state is not fetched per season. One query pulls episode watch history globally:

```
['media', 'watchHistory', 'list', { mediaType: 'episode', limit: 500 }]
```

and `useEpisodeWatchState` filters it down to this season's episode ids in memory. `useBatchSeasonLog` writes optimistically into that exact key (and into the show's progress key) before the request lands, so the key must stay byte-identical across `useSeasonDetailModel.ts` and `useBatchSeasonLog.ts` — a divergence shows up as an optimistic update that silently never appears.

The `limit: 500` is a hard ceiling on episode watch events, not a page size. Past it, older watches drop out of the set and their episodes render as unwatched.

## Optimism and its blast radius

- Per-episode watch toggles are **not** optimistic: `useEpisodeToggle.ts` has no `onMutate`, so the row's watched state stays whatever the shared watch-history query last returned. On success it invalidates `['media','tvShows','listSeasons']` and not that query's key. `togglingIds` only tracks in-flight ids so that one row can be disabled; a failure just toasts, because there is nothing to roll back.
- Season and per-episode monitor switches hold a local override that is written on toggle and **never cleared on success**. `effectiveMonitored` (`useSonarrMonitoring.ts`) and the `monitoredMap` built in `useEpisodeMonitoring.ts` prefer the override over refetched Sonarr data for the rest of the component's life; only `onError` flips it back. `onSettled` clears `pendingEpMonitoring` (the disabled-while-in-flight set), not the override.
- Batch "Mark Season Watched" snapshots both caches, writes the whole season through, and restores both snapshots on failure.

Batch logging only covers **aired** episodes — the server filters on air date, so the returned count can be lower than the season's episode count and the progress bar will legitimately stop short of 100%.

Server-side watch semantics — idempotency on `(media_type, media_id, watched_at)`, the blacklist short-circuit, and watchlist auto-removal once every episode of a show is complete — live in `pillars/media/src/db/services/watch-history-log.ts` and `watch-history-batch.ts`.
