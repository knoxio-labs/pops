# Tags pillar

`@pops/tags` owns the shared tag vocabulary and its structure. Assignments
remain with the pillars that own the tagged records. The pillar stores tags in
its own SQLite database and serves the vocabulary through `GET /tags`.

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
