# ADR-010: Universal Object URI Scheme

## Status

Accepted (2026-03-20)

## Context

POPS is a multi-domain platform where objects in one domain frequently reference objects in another — inventory items link to purchase transactions, media comparisons reference movies, receipts link to both transactions and inventory items. As the platform grows, particularly with the AI overlay (Phase 3), a universal way to address any object in the system becomes essential.

Today, cross-domain references use a polymorphic pattern (`media_type + media_id`, `target_type + target_id`). This works at the table level but there's no system-wide convention for how to express "this specific object in this specific domain."

### Options Considered

**A. UUID on every table**

Add a `uuid TEXT` column to every table. Any object is globally identifiable by its UUID alone, without needing to know the domain or type.

- Pros: Globally unique with zero ambiguity, no parsing needed
- Cons: 36-char strings are slower to index than integers, UUIDs are opaque (you can't tell what a UUID refers to without a lookup), still need a registry or reverse index to resolve UUID → domain/type, adds a column to every table for a feature that doesn't exist yet

**B. Global registry table**

One `objects` table: `(id, domain, type, local_id)`. Every record in the system registers itself here.

- Pros: Single table to query for universal search, central index
- Cons: Write amplification (every insert also inserts into `objects`), sync issues if registration is missed, single point of failure, significant schema and application overhead for a future feature

**C. URI convention with a resolver**

Define a canonical URI format: `pops:{domain}/{type}/{id}`. No schema changes — the URI is a convention that can be constructed from existing data and resolved by a routing function.

- Pros: Zero schema changes, zero storage overhead, human-readable (you can tell what `pops:media/movie/42` is at a glance), parseable by any consumer (AI overlay, Moltbot, deep links, notifications), can be adopted incrementally, resolver is a simple router built when needed
- Cons: Not stored as a column — systems that need to reference arbitrary objects store the URI as a string (or decomposed as `domain + type + id` columns). No database-level enforcement that the referenced object exists.

## Decision

**Option C: URI convention with a resolver.**

No schema changes required. The URI is a string format that any part of the system can construct from existing data and any consumer can parse to locate an object.

### URI Format

```
pops:{domain}/{type}/{id}
```

Examples:
```
pops:finance/transaction/1234
pops:finance/entity/42
pops:finance/budget/7
pops:media/movie/42
pops:media/tv-show/15
pops:media/episode/892
pops:media/comparison/301
pops:inventory/item/18
pops:core/entity/42
```

### Rules

1. **`domain`** matches the API module name (`finance`, `media`, `inventory`, `core`)
2. **`type`** is the singular, kebab-case table/resource name (`transaction`, `movie`, `tv-show`, `episode`)
3. **`id`** is the integer primary key from the relevant table
4. URIs are case-sensitive, lowercase only
5. A URI always resolves to exactly one row in one table — no ambiguity

### Resolver (built when needed, not now)

A resolver is a function that parses a URI and returns the referenced object:

```typescript
// Future: apps/pops-api/src/core/uri-resolver.ts
function resolve(uri: string): Promise<unknown>
// parse "pops:media/movie/42" → call media.movies.getById(42) → return movie
```

The resolver is a router — it maps `domain/type` to the appropriate tRPC procedure or database query. It gets built when the AI overlay or universal search needs it (Phase 3).

### Cross-domain references

When a table needs to reference an arbitrary object in another domain, use one of:

**Option 1 — Decomposed columns (preferred for typed references):**
```sql
target_domain  TEXT NOT NULL  -- 'media'
target_type    TEXT NOT NULL  -- 'movie'
target_id      INTEGER NOT NULL  -- 42
```

**Option 2 — URI string column (preferred for flexible/AI-generated references):**
```sql
target_uri  TEXT NOT NULL  -- 'pops:media/movie/42'
```

Option 1 is better when the domain/type is constrained (e.g., watchlist only references movies or tv-shows). Option 2 is better when any object could be referenced (e.g., AI overlay context, notes, activity log).

### Existing polymorphic patterns

The media schema's `media_type + media_id` pattern is a domain-local version of this. It maps to the URI convention:
- `media_type='movie', media_id=42` → `pops:media/movie/42`
- `media_type='tv_show', media_id=15` → `pops:media/tv-show/15`

No need to retroactively change existing schemas. The URI convention is compatible with and constructable from the existing polymorphic pattern.

## Consequences

- Zero schema changes today — this is a convention, not infrastructure
- Every object in the system is addressable via a human-readable URI
- The AI overlay can accept and return URIs to reference any object across domains
- Moltbot can link to specific objects: "Your electricity bill jumped 40% — see pops:finance/transaction/1234"
- PWA deep links can map directly: `/media/movies/42` ↔ `pops:media/movie/42`
- Universal search (future) fans out a query across domains and returns typed URIs
- The convention can be adopted incrementally — no big-bang migration
