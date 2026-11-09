# Trips pillar

`@pops/trips` owns trip metadata, reusable manual place identities and distinct
visits, stays, journeys and ordered transport legs in its own SQLite database. A place may occur repeatedly in one trip or
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

Stays belong to trips independently of visits. `GET/POST /trips/:tripId/stays`
and `GET/PATCH/DELETE /trips/:tripId/stays/:id` manage stable source records;
lists use identity order, not route or date order. A nullable `visitId` may refer
only to a visit in the owning trip. Linking or detaching it never copies dates.
Stay timing contains independent optional `arrival` and checkout-exclusive
`departure` calendar dates, optional `checkIn`/`checkOut` HH:mm local clocks and
an explicit supported IANA `timeZone`. A clock, date or zone may be captured on
its own. Reversed dates, dates outside a visit, and skipped/repeated DST clocks
remain source facts. No clock, zone, boundary or status is inferred.

Stay `kind` is optionally hotel, friend, family or other. The singular optional
`status` is Considering, Agreed, Reserved or Purchased; only explicit Purchased
is a hard purchase fact. Empty stays select no kind or status. Name, address,
reference and visit association are nullable. Notes and provenance `sourceLinks`
are separate from `hostLinks` and `documentLinks`; each reference array uses the
same explicit URI/optional-label contract. These links are opaque, retained even
when their source is unavailable, and do not assert contact/document resolution
or transfer ownership. Deleting a stay removes only that source record.

A stay patch preserves omitted fields. Supplied `timing` replaces the **complete**
timing object, so `{}` clears it and `{ arrival: "2028-01-16" }` removes any
previous departure, clocks and zone. Arrays likewise replace complete arrays;
`[]` clears them. `null` clears nullable scalar fields and detaches a visit.

Journeys belong to trips independently of visits. `GET/POST /trips/:tripId/journeys`
and `GET/PATCH/DELETE /trips/:tripId/journeys/:id` manage source metadata,
reference, notes, source links and optional configured buffers. Under a journey,
`GET/POST .../:journeyId/legs` and `GET/PATCH/DELETE .../:journeyId/legs/:id` manage
stable source legs. `PUT .../:journeyId/leg-order` accepts complete `legIds`
membership, with the same atomic source-preserving ordering rule as visits.
Deleting an ungrouped journey removes its own legs atomically; grouped sources
return `409` until their grouping is explicitly removed. Neither deletion cancels
an external booking.

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

`GET /trips/:tripId/journeys/:id/timing` projects the persisted source legs in
one read transaction. It returns resolved endpoint instants, signed leg elapsed
minutes, signed time available between adjacent legs, a local-calendar window,
and nonblocking clock/chronology findings. Negative elapsed or available minutes
record contradictions; zero is not an overlap. An absent clock or zone remains
unknown without a filler finding. A complete clock that cannot be resolved
unambiguously produces `clock_unresolved` and a null instant; no DST side is
silently selected. Source values, timestamps, purchase facts, visit order and
group selection remain unchanged.

Clock resolution uses the Temporal polyfill with `disambiguation: 'reject'`.
Skipped and repeated local clocks stay unresolved. Temporal supports nanosecond
precision; source clocks beyond that precision remain stored verbatim and
unresolved rather than being truncated. The returned ISO instants can use
extended calendar-year spelling when a boundary crosses the source year range.
The window begins at midnight on the local day before the first source departure
and ends exclusively at midnight two local dates after the last source arrival.
These are calendar shifts in the explicit source zones, including DST changes,
not fixed 24-hour shifts. Unresolved endpoints or boundaries and nonpositive
windows return a null window. The timing route does not assert connection
safety: nearby bookings, transport classification and location-dependent buffer
or transfer findings remain tracked by POPS-6134.

Journey groups explicitly associate existing source records without changing them.
`GET/POST /trips/:tripId/journey-groups` list or create groups; creation requires
`currentJourneyId` and optional distinct `alternativeJourneyIds` belonging to the
same trip. `GET .../:id` previews ordered source identities; use the existing
journey and leg read routes for source content. Reads never select. Journeys may
be members of multiple groups, with independent selections and alternative order.
The underlying journey list continues to include every source record.

`POST .../:id/alternatives` creates a separate blank journey that copies only the
current source's explicit buffer configuration. It copies no name, reference,
notes, links or legs and selects no places or documents. Existing places and
external Documents identities remain reusable through their source owners;
groups create no catalogues. Subsequent edits to either source stay independent.

`PUT .../:id/selection` explicitly selects a member `journeyId`. The previous
current becomes an alternative in the selected slot; other alternative positions
are retained. Selection changes only grouping metadata, preserving every journey
and leg identity, source value and timestamp. Selecting the former current again
reverses that selection without replacing source records or cancelling bookings.

Adding a blank alternative, selecting, and `DELETE .../:id` require the read
`expectedRevision`. A stale revision returns `409`; unknown groups, nonmembers
and foreign-trip identities return `404` without mutation. Successful membership
or selection changes advance the group revision. Selecting the same current at
the matching revision is an unchanged response. Source edits do not advance group
revisions: they remain edits to those independently owned records. Mutations are
atomic SQLite transactions. Deleting a group removes only its membership and
selection metadata, retaining all source journeys and legs, including shared
memberships in other groups. Explicit source journey deletion returns `409`
while any group membership remains.

Domain routes require their projected service-account scope: `trips.trips`,
`trips.places`, `trips.visits`, `trips.journeys`, `trips.journeyLegs`,
`trips.journeyGroups` or `trips.stays`; a `trips` grant covers all domains. Discovery and
health probes remain open. The pillar has no frontend application.

Run `mise exec -- pnpm --filter @pops/trips dev`. `PORT` defaults to 3018;
`TRIPS_SQLITE_PATH` selects the database (default `./data/trips.db`).
`TRIPS_SELF_BASE_URL` selects its advertised origin and
`POPS_REGISTRY_ENABLED=true` enables self-registration. Production uses its own
volume and Litestream sidecar. Generate migrations with
`mise exec -- pnpm exec drizzle-kit generate` from this directory.
