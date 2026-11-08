# Trips pillar

`@pops/trips` owns trip metadata, reusable manual place identities and distinct
visits, journeys and ordered transport legs in its own SQLite database. A place may occur repeatedly in one trip or
across trips. Contacts owns reusable contact identities and addresses; Documents
owns original files; Tags owns shared membership. Explicit HTTP(S) and
`pops:{pillar}/{type}/{id}` source links refer to records without copying them.

`GET/POST /trips` and `GET/PATCH /trips/:id` manage optional trip names, notes and
source links. Equivalent `/places` routes manage reusable names and source links.
`GET/POST /trips/:tripId/visits` and `GET/PATCH /trips/:tripId/visits/:id` manage
visit facts. A new visit appends to that trip's route.

Visit timing supports independent arrival/departure calendar dates, approximate
year/month/early-middle-late precision and a numeric min/max duration in days or
weeks. Durations are non-negative, including zero for a same-day visit; the
maximum must not precede the minimum. Missing timing remains unknown. Valid but contradictory dates are retained
for later conflict presentation. No date is inferred from route position or a
different visit. A timing update replaces the complete timing value; `{}` clears
it. Omitted metadata fields retain their values; `null` clears an optional name.

`PUT /trips/:tripId/visit-order` accepts the complete `visitIds` array. Each visit
must belong to the trip and appear exactly once. Reordering is atomic and changes
only position, preserving source values and timestamps. No purchase, reservation
or certainty is inferred from route or timing.

Journeys belong to trips independently of visits. `GET/POST /trips/:tripId/journeys`
and `GET/PATCH/DELETE /trips/:tripId/journeys/:id` manage source metadata,
reference, notes, source links and optional configured buffers. Under a journey,
`GET/POST .../:journeyId/legs` and `GET/PATCH/DELETE .../:journeyId/legs/:id` manage
stable source legs. `PUT .../:journeyId/leg-order` accepts complete `legIds`
membership, with the same atomic source-preserving ordering rule as visits.
Deleting a journey removes its own legs atomically; neither deletion cancels an
external booking.

Each endpoint independently retains an optional existing `placeId`, source label
and links, local calendar wallclock, and explicit supported IANA zone. Place data
never fills a clock or zone. Local clocks have ISO date and time syntax without
an offset; seconds and fractional seconds are optional. Calendar and zone validity
are checked independently. DST gaps/overlaps and reversed or overlapping journey
chronology remain recorded source facts without forcing an instant. Missing
endpoint values stay absent. A supplied endpoint object replaces its complete
value; `{}` clears it.

Mode is optional, nonblank free-form source text with no inferred transport
classification. Per-leg intention (`In plan`, `Considering`, `Alternative`),
arrangement (`Booked`, `Agreed`, `Not arranged`, `Not needed`) and purchase
(`Purchased`) remain independent optional choices. Only explicit purchase
records that fact; dates, references and reservations never imply it. Omitted
patch fields retain values and `null` clears nullable choices or text. Empty
journeys and legs select no source facts. Configured connection and airport
buffers are nonnegative physical minutes, including zero and fractions; missing
thresholds have no defaults. A supplied buffers object replaces its complete
configuration and `{}` clears it. Source links may remain unavailable remotely.

Domain routes require their projected service-account scope: `trips.trips`,
`trips.places`, `trips.visits`, `trips.journeys` or `trips.journeyLegs`; a `trips` grant covers all domains. Discovery and
health probes remain open. The pillar has no frontend application.

Run `mise exec -- pnpm --filter @pops/trips dev`. `PORT` defaults to 3018;
`TRIPS_SQLITE_PATH` selects the database (default `./data/trips.db`).
`TRIPS_SELF_BASE_URL` selects its advertised origin and
`POPS_REGISTRY_ENABLED=true` enables self-registration. Production uses its own
volume and Litestream sidecar. Generate migrations with
`mise exec -- pnpm exec drizzle-kit generate` from this directory.
