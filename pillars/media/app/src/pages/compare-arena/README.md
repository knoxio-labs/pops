# Compare Arena

`/media/compare`. Two posters, one taste dimension, pick a winner or a tiered draw.

There is **no arena endpoint**. Every control maps onto the generic comparisons contract (`comparisonsRecord`, `comparisonsRecordSkip`, `comparisonsMarkStale`, `comparisonsExcludeFromDimension`, `comparisonsBlacklistMovie`, `comparisonsScores`) plus watchlist CRUD.

## The destructive controls are per-card

N/A and "not watched" are per-card, not per-pair: clicking the left card's N/A excludes only the left movie. Both are destructive on the server — N/A purges that movie's comparisons for the current dimension, "not watched" purges them across every dimension — which is why "not watched" is the only action gated by `BlacklistConfirmDialog`, and why the dialog fetches the exact purge count first via `comparisonsListForMedia`.

## Two pieces of state that are not obvious

**The dimension override is one-shot, except after N/A.** Picking a dimension in `ArenaDimensionPicker` sets `manualDimensionId`, which is part of the `smart-pair` query key and so pins the next fetch. Record, draw, skip, mark-stale and blacklist all call `onAfterAction`, which clears it back to `null`, handing dimension choice back to the server's `pickDimensionByNeed`; a user who wants three comparisons on one dimension has to re-pick it three times. `handleNA` (`useStaleAndExclude.ts`) is the exception — it never calls `onAfterAction`, so the pair advances with the dimension still pinned.

**The score-delta window locks everything.** After a recorded comparison the page fetches both movies' scores, renders the `±N` badges, and holds them for `DELTA_DISPLAY_MS` (1.5s, `useScoreDelta.ts`). `isPending` is `recordMutation.isPending || scoreDelta !== null`, and `ArenaPair` passes it to both cards and to `DrawTierButtons`, so the whole pair is disabled for that window.

The smart-pair query runs with `gcTime: 0` / `staleTime: 0` and no refetch on focus. Caching a pair would mean re-showing a comparison the user already answered.

## Empty states are two different messages

`smart-pair` returning `null` is ambiguous on its own, so `ArenaEmptyState` disambiguates client-side using the size of the watchlisted-movie map: "Not enough watched movies", link to the library.

## Where things live

| Concern                                 | File                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Query composition, dimension override   | `useCompareArenaPageModel.ts`                                                        |
| Action fan-out and the `isPending` gate | `useArenaActions.ts`                                                                 |
| Record / draw / skip mutations          | `useArenaRecord.ts`                                                                  |
| Score-delta fetch, timer, and shape     | `useScoreDelta.ts`, `scoreDelta.ts`                                                  |
| Stale + N/A mutations                   | `useStaleAndExclude.ts`                                                              |
| Blacklist confirm flow                  | `useArenaBlacklist.ts`                                                               |
| Watchlist toggle                        | `useArenaWatchlist.ts`                                                               |
| Layout                                  | `ArenaHeader`, `ArenaDimensionPicker`, `ArenaPrompt`, `ArenaPair`, `ArenaEmptyState` |

Server-side eligibility, pair scoring and the effect of each destructive action are documented in `pillars/media/src/db/services/comparisons/`.
