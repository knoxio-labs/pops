# Tags pillar

`@pops/tags` owns the shared tag vocabulary and its hierarchy. It stores no
assignments and does not index records from other pillars; each record-owning
pillar manages its own tag assignments and searches its own records.

The service provides these routes:

- `GET /tags` lists tags, optionally filtered by facet, archive state, and
  update time.
- `GET /tags/:id` reads one tag.
- `POST /tags` creates a tag or returns its existing active match.
- `PATCH /tags/:id` updates a tag's name, parent, description, or date window.
- `POST /tags/:id/archive` and `POST /tags/:id/unarchive` change archive state.
- `POST /tags/:id/merge` merges one tag identity into another.
- `POST /tags/expand` resolves merged identities and returns descendants.

The vocabulary is stored in the tags pillar's own SQLite database.

The route requires a service-account grant of `tags.tags`. `/health`,
`/pillars`, and `/openapi` remain available for probes and discovery.

Run it locally with:

```bash
pnpm install
pnpm dev
```

`TAGS_SQLITE_PATH` selects the database file. `TAGS_SELF_BASE_URL` sets the
origin advertised to the registry, and `POPS_REGISTRY_ENABLED=true` enables
self-registration.
