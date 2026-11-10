# Trips pillar

`@pops/trips` owns trip metadata, reusable manual place identities and distinct
visits, stays, events, rental periods, journeys and ordered transport legs in its own SQLite database. A place may occur repeatedly in one trip or
across trips. Contacts owns reusable contact identities and addresses; Documents
owns original files; Tags owns the shared vocabulary, while assignments remain
with their source pillars. Explicit HTTP(S) and
`pops:{pillar}/{type}/{id}` source links refer to records without copying them.

`GET/POST /trips` and `GET/PATCH /trips/:id` manage optional trip names, destination and
opaque human-written `when` text, notes, source links, a nullable `parentId` and
a nullable Tags-owned UUID `tagId`. Destination and When default to empty source
text and remain verbatim; When is never parsed into route dates. Omission retains
stored values; empty strings clear text and null clears name or associations.
Existing optional name semantics stay unchanged: omitted/null is valid and an
explicit empty/whitespace-only name is rejected. Titles are a consumer projection,
not another persisted source field. Parent identities are existing numeric Trip
IDs; self, descendants and cyclic ancestry are rejected atomically without
rewriting either trip's route. A missing parent is a 400 validation failure.

Only an explicit unknown tag selection refreshes a minimal identity cache through
the authenticated Tags SDK. A successful complete response replaces the cache
atomically; malformed/unavailable responses preserve it. Blank/omitted selections
and known cached IDs require no Tags dependency. Unknown selections return 400;
unverifiable selections return retryable 503 without partially changing trip
source. Cache refresh never erases a retained trip reference, and independent
metadata edits do not revalidate omitted associations. Trips owns no shared tag
names, hierarchy, windows, archive/merge rules or vocabulary writes.
Outbound reads use a Trips-owned service account granted `tags.tags` and
`contacts.entities.reference`. Local
configuration can supply `POPS_INTERNAL_API_KEY`; production supplies only a
mounted-file path in `POPS_INTERNAL_API_KEY_FILE`. Startup checks configured
secret-file readability and prefers that file over the local environment. No
credential is created by Trips. Both compose variants mount the Trips-owned
`pops_trips_api_key` secret; the operator must first provision the account and
host file using the [Trips deployment runbook](../../infra/secrets.example/trips/README.md).
Without credentials in a standalone local process, independent metadata remains
usable and an unknown explicit tag selection returns retryable 503.

Equivalent `/places` routes manage reusable names and source links.
`GET/POST /trips/:tripId/visits` and `GET/PATCH /trips/:tripId/visits/:id` manage
visit facts. A new visit appends to that trip's route with revision zero. Visit
responses include a monotonic safe-integer `revision`. PATCH accepts optional
`expectedRevision` for compatibility; editors and Undo supply it. A stale write
returns 409 atomically. Every successful PATCH and route-order row write advances
revision by exactly one, including unchanged values. Exhausted revisions reject
the complete mutation without advancing any row.

Visit timing supports independent arrival/departure calendar dates, approximate
year/month/early-middle-late precision and a numeric duration in explicit days or
weeks. Duration requires a minimum, maximum or both; an omitted bound remains
unknown. Bounds are finite and non-negative, including zero for a same-day visit;
when both are supplied, the maximum must not precede the minimum. Missing timing remains unknown. Valid but contradictory dates are retained
for later conflict presentation. No date is inferred from route position or a
different visit. A timing update replaces the complete timing value; `{}` clears
it. Omitted metadata fields retain their values; `null` clears an optional name.

`PUT /trips/:tripId/visit-order` accepts the complete `visitIds` array. Each visit
must belong to the trip and appear exactly once. Reordering is atomic and changes
position and revision, preserving source values and timestamps. No purchase, reservation
or certainty is inferred from route or timing.

Events belong to trips independently of visits. `GET/POST /trips/:tripId/events`
and `GET/PATCH/DELETE /trips/:tripId/events/:id` retain event source facts.
The optional visit must belong to the same trip; changing the association never
copies dates. Dates, clocks and the source time zone are independently optional.
Contradictory valid dates remain editable; missing clocks never become midnight.
Intention, arrangement and purchase use the same independent source vocabulary
as journey legs. Only `Purchased` records a purchase. Venue, organiser and
document links are opaque source references, not hydrated external identities.
Source and ticket URLs accept HTTP(S) only. Patches retain omitted fields,
clear nullable facts with null, and replace supplied timing objects and arrays.
Deleting an event never deletes a referenced contact, document or booking.
Event operations use the projected `trips.events` scope.

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

Rentals belong to trips independently of visits. `GET/POST /trips/:tripId/rentals`
and `GET/PATCH/DELETE /trips/:tripId/rentals/:id` retain one rental identity with
nullable `provider`, `pickupVisitId`, `returnVisitId`, calendar-only `start` and
`end`, and `status` (Considering, Reserved or Purchased). Only explicit Purchased
is a hard purchase fact. Empty rentals select nothing. Bounds are independent;
partial, equal and reversed dates remain source facts. No clock, zone, office
address, journey coverage or route insertion is inferred. Visit movement changes
neither rental identity nor dates, and repeated towns remain distinct occurrences.

New or changed pickup/return references must identify an existing Visit in the
same trip, inside the source write transaction. Visit identities are logical
references: if a Visit is removed, its retained rental reference remains available
for missing-reference presentation. Unrelated edits and unchanged references do
not revalidate that missing source. Null explicitly detaches either endpoint;
it never changes dates. Patches retain omitted fields and clear nullable facts
with null. Creation starts at revision zero; PATCH and DELETE require
`expectedRevision`. Successful patches advance by exactly one. Stale or exhausted
safe-integer revisions return 409 without mutation.

Responsibility is a separate optional association for a whole journey, stay,
event or rental, never a journey leg. `GET /trips/:tripId/responsibilities` lists
recorded states; `GET/PUT /trips/:tripId/responsibilities/:targetKind/:targetId`
reads or replaces one target's association. The `responsibility` value is null
(unset), `{ kind: "self" }`, or `{ kind: "contact", uri }`. Consumers choose the
Contacts-issued `uri` from `GET /entities/:id/reference`. A new or changed
Contact selection is verified through that same authenticated owner operation;
Trips stores the returned canonical URI, including an explicit alias redirect,
without constructing an identity from display text. The response's canonical ID
and URI must agree. Unknown identities return 400; unavailable, refused or
malformed owner responses return retryable 503 without changing source state.
Trips rechecks target ownership and the expected revision in the write transaction
after the owner read, so concurrent replacement or deletion is preserved.

Reads, self, clear and an unchanged retained Contact URI require no Contacts call.
A retained unresolved reference remains editable and clearable offline; choosing
it again after clear is a new selection and requires owner verification. Trips
never copies, mutates or deletes the Contact. Independent arrangement edits
remain usable when Contacts is unavailable.

Every target is checked in the same trip transaction. A new target reads as
unset at revision zero. PUT requires `expectedRevision` and replaces the entire
association, advancing by exactly one. Clearing retains a revisioned unset row,
which list includes, so a stale initial write cannot recreate a cleared value.
Stale or exhausted revisions return 409. There is at most one state per target.
Deleting an arrangement atomically removes only its responsibility state;
independent source edits preserve it. Hosts, organisers, operators and purchases
never select responsibility. Responsibility grants no access or role; its routes
require `trips.responsibilities`, independently of source-edit scopes.

Trips document associations use `POST/GET /trips/:tripId/document-associations`
and `DELETE /trips/:tripId/document-associations/:id`. They retain the numeric
Documents-owned Paperless identity and an explicit trip, visit, journey, stay
or event target. Targets must belong to the route trip. Deleting an event,
journey or stay atomically removes associations targeting only that record.
Unlinking removes only the
association; it does not modify the original document. Existing stay
`documentLinks` remain opaque source references and are not rewritten.

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
Leg lists return an atomic `{revision, legs}` snapshot. Create, PATCH and complete-order
writes accept an optional `expectedRevision` for existing consumers; the editor supplies
it for every write. Each first successful leg write advances this collection exactly once,
including legacy hard DELETE; metadata edits do not. Revisions use JSON/JavaScript safe
integers. New writes reject an exhausted counter atomically; reads and exact receipt
replays remain available.

`POST .../:journeyId/legs/:id/removals` accepts `{operationId, expectedRevision}`;
`POST .../:journeyId/leg-removals/:operationId/restore` accepts `{expectedRevision}`.
Both return the current atomic collection and a persisted lifecycle receipt. Exact retries
reuse the original intent and never repeat an old removal or restore a later lifecycle.
Removed source rows retain identity, facts and audit timestamps; ordinary reads and timing
omit them. Restore requires the guarded revision and exact post-removal live order, then
inserts the original identity at its prior position. It does not revalidate historical optional
endpoint facts as new input. Restore and removal do not silently merge concurrent edits.
Receipt revisions identify an operation's own outcome; a replay observing a later revision
cannot lend that revision to Undo. Parent hard deletion removes its own retained rows and
receipts. Legacy DELETE remains an irreversible 204 operation.

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

`GET /trips/:tripId/journeys/:id/workspace` returns source metadata, ordered live
legs and timing derived from exactly those legs inside one SQLite read transaction.
Consumers that combine source clocks and projected instants use this aggregate rather
than joining independent reads across concurrent edits. It uses the owning journey
scope and never rewrites source records or selection.

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
`trips.journeyGroups`, `trips.stays`, `trips.events`, `trips.rentals` or
`trips.responsibilities`; a `trips` grant covers all domains. Discovery and
health probes remain open. The pillar advertises its implemented shell pages through
its published page descriptor, including the source-backed visit workspace. The home
page groups source-backed trips and opens a selected-trip preview; stay links use the persisted trip and
stay identities. Source-backed stay
[workspace components](../../libs/trips-workspace/README.md) and their standalone
development harness remain in `libs/trips-workspace`. The shell loads
`/trips-ui/trips.js` and `/trips-ui/trips.css` from the `trips-ui` service.

Run `mise exec -- pnpm --filter @pops/trips dev`. `PORT` defaults to 3018;
`TRIPS_SQLITE_PATH` selects the database (default `./data/trips.db`).
`TRIPS_SELF_BASE_URL` selects its advertised origin and
`POPS_REGISTRY_ENABLED=true` enables self-registration. Production uses its own
volume and Litestream sidecar. Generate migrations with
`mise exec -- pnpm exec drizzle-kit generate` from this directory.

## Decisions and options

Decisions belong to a trip independently of its arrangements. `/trips/:tripId/decisions`
provides list/create and `/:id` provides get/patch/delete. Source fields are
`question`, nullable date-only `deadline`, `notes` and `sourceLinks`. An empty
decision has no selected option or deadline. Options at `/:decisionId/options`
provide list/create and `/:id` get/patch/delete, retaining `title`, `notes`,
`sourceLinks` and `affectedSources`. Each affected source is an explicit
`{ kind: 'visit' | 'journey' | 'stay', id }` identity in the same trip. Creation
validates every reference. Each option privately retains its validated exact
kind/ID membership history. PATCH may retain, unlink or restore a historical
membership after source deletion; genuinely new memberships must currently belong
to the trip. A currently live source owned by another trip is always rejected.
Existing live and tombstoned option memberships are backfilled when this provenance
is migrated, and it survives unlink, option removal and restoration. Historical
references remain identifiable after source deletion. Duplicate references
are rejected. Options never own or rewrite arrangements.

Every mutation after decision creation requires `expectedRevision` from the
owning decision. Immediate transactions reject stale writes with 409 and advance
the aggregate revision for option edits as well as decision edits. Reads do not
select. `PUT /trips/:tripId/decisions/:id/selection` accepts a nullable `optionId`;
null reopens the decision. A selected option must belong to that decision.
Removing the selected option clears the selection atomically; deleting a decision
removes only its options and source record. Neither operation cancels bookings.

PATCH omission retains values, null clears the deadline, and supplied arrays
replace their complete values. Decision/option text may be empty for unfinished
source capture. Selection and its inverse are explicit revision-guarded writes;
there is no persisted general Undo log or derived deadline clock.

Option DELETE retains a removed source record rather than destroying its identity;
ordinary GET/list routes omit removed options. POST
`/trips/:tripId/decisions/:decisionId/options/:id/restore` requires
`expectedRevision` and an explicit boolean `select`. False retains the current
selection; true selects the restored option atomically at that same revision.
Restoring never revalidates or modifies retained affected sources. Foreign
ownership and removed decisions return 404; an already-live option returns 409.
There is no retention expiry or automatic cleanup. This supports identity-preserving
Undo without creating a replacement option or racing a separate selection write.

The revision progression is part of the mutation protocol: every successful guarded
decision or option mutation produces exactly `expectedRevision + 1`; failed
mutations preserve the previous revision. Decision creation starts at zero.
Option mutation responses do not contain the parent revision and DELETE returns
204, so consumers may record that exact one-step result for their own operation.
A later parent read with a different revision must clear local Undo rather than
adopting another writer's revision for an inverse mutation.

`GET /trips/:tripId/decisions/:id/workspace` reads the decision and its live
options in one SQLite snapshot, exposing `{ decision, options }` without
resolving linked arrangements. Consumers can compare the coherent aggregate
revision after a mutation rather than combining unrelated parent/option reads.
