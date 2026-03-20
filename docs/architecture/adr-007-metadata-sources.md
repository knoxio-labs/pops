# ADR-007: TMDB for Movies, TheTVDB for TV Shows

## Status

Accepted (2026-03-20)

## Context

The media app needs an external metadata source for movies and TV shows — titles, overviews, posters, cast, genres, ratings. Two major free APIs exist: TMDB (The Movie Database) and TheTVDB (The TV Database). Both cover movies and TV, but with different strengths.

### Options Considered

**A. TMDB for everything**

Use TMDB as the sole metadata source for both movies and TV shows. TMDB has comprehensive movie and TV data, a well-documented API (v3), and a large community.

- Pros: One API client to build and maintain, one set of rate limits to manage, one API key, simpler codebase
- Cons: TMDB's TV data, while good, is not the industry standard for TV metadata. Plex, Sonarr, and Kodi all default to TheTVDB for TV show matching. Using TMDB for TV would create ID mismatches with the rest of the media stack.

**B. TheTVDB for everything**

Use TheTVDB as the sole metadata source for both movies and TV shows.

- Pros: One API, aligns with Sonarr and Plex for TV
- Cons: TheTVDB's movie coverage is weaker than TMDB. Radarr uses TMDB IDs for movies. Would create ID mismatches for the movie side of the stack.

**C. TMDB for movies, TheTVDB for TV shows**

Use each service where it's strongest and where the rest of the stack already uses it.

- Pros: Aligns with the native metadata agents used by Plex (TMDB for movies, TheTVDB for TV), Radarr (TMDB), and Sonarr (TheTVDB). ID matching in Plex Sync (Epic 6) and Radarr/Sonarr integration (Epic 7) is direct — no cross-referencing needed.
- Cons: Two API clients to build and maintain, two API keys, two rate limiting strategies.

## Decision

**Option C: TMDB for movies, TheTVDB for TV shows.**

The deciding factor is alignment with the existing media stack. Plex, Radarr, and Sonarr already use this exact split. Matching Plex library items or Sonarr-monitored shows to local records becomes a direct ID lookup instead of a cross-reference search. The cost (two API clients) is low — each client is a thin wrapper around a REST API, and isolating them behind service interfaces means they can be maintained independently.

## Consequences

- `movies` table uses `tmdb_id` as the external identifier
- `tv_shows`, `seasons`, `episodes` tables use `tvdb_id` as the external identifier
- Two API client services, each with their own rate limiter and authentication
- Plex Sync matches movies via TMDB agent ID and TV via TheTVDB agent ID — direct lookups, no cross-referencing
- Radarr integration matches on TMDB ID, Sonarr on TheTVDB ID — native to each service
- If either API becomes unreliable, the other media type is unaffected
- Poster caching pulls from two image CDNs (TMDB image server for movies, TheTVDB image server for TV)
