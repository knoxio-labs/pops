# Trips pillar

`@pops/trips` owns trip metadata, reusable manual place identities and distinct
visits in its own SQLite database. A place may occur repeatedly in one trip or
across trips. Contacts owns reusable contact identities and addresses; Documents
owns original files; Tags owns shared membership. Explicit HTTP(S) and
`pops:{pillar}/{type}/{id}` source links refer to records without copying them.

`GET/POST /trips` and `GET/PATCH /trips/:id` manage optional trip names, notes and
source links. Equivalent `/places` routes manage reusable names and source links.
`GET/POST /trips/:tripId/visits` and `GET/PATCH /trips/:tripId/visits/:id` manage
visit facts. A new visit appends to that trip's route.

Visit timing supports independent arrival/departure calendar dates, approximate
year/month/early-middle-late precision and a numeric min/max duration in days or
weeks. Missing timing remains unknown. Valid but contradictory dates are retained
for later conflict presentation. No date is inferred from route position or a
different visit. A timing update replaces the complete timing value; `{}` clears
it. Omitted metadata fields retain their values; `null` clears an optional name.

`PUT /trips/:tripId/visit-order` accepts the complete `visitIds` array. Each visit
must belong to the trip and appear exactly once. Reordering is atomic and changes
only position, preserving source values and timestamps. No purchase, reservation
or certainty is inferred by this foundation.

Domain routes require their projected service-account scope: `trips.trips`,
`trips.places` or `trips.visits`; a `trips` grant covers all three. Discovery and
health probes remain open. The pillar has no frontend application.

Run `mise exec -- pnpm --filter @pops/trips dev`. `PORT` defaults to 3018;
`TRIPS_SQLITE_PATH` selects the database (default `./data/trips.db`).
`TRIPS_SELF_BASE_URL` selects its advertised origin and
`POPS_REGISTRY_ENABLED=true` enables self-registration. Production uses its own
volume and Litestream sidecar. Generate migrations with
`mise exec -- pnpm exec drizzle-kit generate` from this directory.
