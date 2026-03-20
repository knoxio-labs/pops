# ADR-006: Split Tables for Media Schema

## Status

Accepted (2026-03-20)

## Context

The media domain needs to store movies and TV shows. TV shows have a hierarchical structure (show → season → episode) that movies don't. Two approaches were considered for the schema.

### Options Considered

**A. Unified `media_items` table with a type discriminator**

One table with a `type` column (`movie`, `tv_show`, `season`, `episode`). Shared columns (title, overview, poster_path, vote_average) sit on every row. Type-specific columns (e.g., `season_number`, `episode_number`, `runtime` for movies) are nullable and only populated for the relevant type.

- Pros: One table to query, simpler joins for features that operate across types (comparisons, watchlist), fewer migrations
- Cons: Many nullable columns, no FK-enforced hierarchy (self-referential parent_id is fragile), queries need `WHERE type = ...` everywhere, TV hierarchy constraints (unique episode per season) require complex partial indexes, the table grows to ~8,100 rows mixing four conceptually different record types

**B. Separate tables: `movies`, `tv_shows`, `seasons`, `episodes`**

Each type gets its own table with only the columns it needs. TV hierarchy is enforced via foreign keys (episodes → seasons → tv_shows). Movies are a flat table with no hierarchy.

- Pros: Clean FK-enforced hierarchy for TV, no nullable type-specific columns, natural indexes (e.g., unique episode per season is a simple UNIQUE constraint), each table is small and focused, queries don't need type filters
- Cons: Features that span types (watchlist, comparisons, scores) need a polymorphic reference pattern (`media_type + media_id`), which can't be FK-enforced at the database level. More tables to manage.

## Decision

**Option B: Split tables.**

The TV hierarchy is the deciding factor. Show → season → episode is a real structural relationship, not a tag. Encoding it as self-referential parent_id in a unified table would lose FK enforcement, make cascade deletes fragile, and require application-level validation for constraints that the database should own.

The polymorphic reference trade-off (watchlist, comparisons, scores using `media_type + media_id`) is acceptable at this scale (~8,100 rows). Application-level validation in tRPC procedures handles the integrity that FKs can't. If this becomes a pain point, junction tables per type are a straightforward migration.

## Consequences

- Four media tables: `movies`, `tv_shows`, `seasons`, `episodes`
- TV hierarchy is FK-enforced with `ON DELETE CASCADE` — deleting a show cascades to seasons and episodes
- Cross-type features (watchlist, comparisons, media_scores) use `media_type + media_id` polymorphic pattern with application-level validation
- Adding a new media type (e.g., documentaries, anime as a distinct type) means a new table, not a new discriminator value — but this is unlikely given movies and TV shows cover the space
