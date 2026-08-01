# Discover surface

Upstream-touching orchestration for `/media/discover`: TMDB and Plex Discover calls, the shelf pipeline, and the annotation/filtering that turns raw upstream results into `DiscoverResult`. The pure persistence and scoring half lives in `../../../db/services/discovery/`.

## Two surfaces, one of them unused by the page

There are two independent ways to get discover content, and mistaking one for the other is the easy error here:

- **The session** (`assemble-session.ts` + `shelf/`) — `POST /discovery/session` assembles an ordered set of shelves per visit. This is what the page renders, and it is never cached.
- **The section endpoints** (`trending.ts`, `recommendations.ts`, `genre-spotlight.ts`, `context-picks.ts`, `plex-trending.ts`, `basic.ts`) — `GET /discovery/trending`, `/recommendations`, `/genre-spotlight`, `/context-picks`, `/from-your-server`, `/rewatch-suggestions`, `/quick-pick`. All live, all contract-backed, and the discover page calls **none** of them.

So changing a section endpoint's shape does not change the page, and a shelf can diverge from its endpoint namesake without anything failing.

## Assembly order and the numbers behind it

`shelf/session.ts` decides which shelves appear; `assemble-session.ts` fetches and prunes them.

1. Every definition in `shelf/registry.ts` (a frozen array — nothing self-registers) generates zero or more instances against the preference profile.
2. Pinned instances are set aside and always prepended, skipping the scoring, weighted selection and category caps below — but not the thin-shelf floor in step 6. They also shrink the random target by their own count. `leaving-soon` is the only pinned shelf.
3. Non-pinned instances score `instance.score × freshness`, where freshness comes from the last 7 days of `shelf_impressions` (`1 / (1 + count)`, floored at 0.1 — over-exposure never fully suppresses a shelf).
4. Weighted-random selection down to the target count, re-scoring each pick with a variety bonus (+0.2 when the category differs from the previous pick) and a context boost (+0.3). Caps: 3 `seed`, 2 genre, 1 `local` per sliding window of 3.
5. First pages fetch in parallel; a shelf whose `query` throws becomes empty rather than failing the session.
6. Shelves under 3 items are dropped (pinned need only 1), and impressions are recorded for the survivors — so a shelf that was assembled but pruned does not count as shown.

Paging a shelf (`GET /discovery/shelves/:shelfId`) re-derives the instance from scratch: `resolveShelfInstance` splits the id on `:`, finds the definition, regenerates, and matches. Nothing about the original session is stored, so generation must stay deterministic for a given profile.

## Match percentage is genre affinity, nothing else

Despite the name, TMDB vote average, popularity and the ELO of whatever seeded the result do not enter the number at all. Affinities come from comparison ELO; when there are none, watch-history genre distribution is used instead, and a result with no recognised genre scores 0.

Two consequences worth knowing before touching ordering:

- The popularity sort happens before `getScoredRecommendations` re-sorts by match percentage. Nothing is dropped for low popularity.
- Recommendation seeds are the top library movies by TMDB **vote average**, not by the user's own ELO.

## Cold start and degradation

The cold-start guard documented in `basic.ts` is duplicated shelf-side: the `recommendations` shelf query in `existing-shelves.ts` applies the same below-5-comparisons check itself. Dimension shelves need 5 comparisons on their dimension. None of these are errors — they are empty shelves that the thin-shelf filter removes.

## Configuration

`config.ts` reads `process.env` (keys are the `contract/settings/discovery-manifest.ts` field keys, upper-snake-cased). These are process-level and need a restart — unlike the comparisons engine, which re-reads its knobs from the `settings` table on every call.

## Absent

Nothing here is TV-aware; every shelf and every section is movies-only, and trending is fetched live per request with no local cache (POPS-233). `franchise-completions` approximates "finish the series" with genre overlap — TMDB collection membership is not stored, so it cannot detect a partially-watched collection (POPS-84).
