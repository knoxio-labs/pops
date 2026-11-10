# Trips workspace components

`TripOverview` is the approved route-first read surface. Its host supplies translated
labels and links to published source pages. Trip, Place, ordered Visit, Journey,
Journey group, Stay, Event, Decision and document-association reads fail independently;
cached successes remain visible during refresh failures. Missing source references
retain their identities. Only explicit Visit IDs attach stays and events to route
occurrences. Journeys remain independent of visits, with current and alternative
identities supplied solely by explicit groups. An Alternative event stays visible.
Only Purchased sources get hard styling. Date-only values never move timezone, and
partial bounds, approximate months, duration and opaque trip When text stay distinct.
Document associations identify their originals without claiming external resolution.

`JourneyWorkspace({ tripId, journeyId, client? })` exports the source-backed Departure
and arrival journey editor. It reads ordered legs and independent grouping identities
through the same generated Trips client. Endpoint edits submit complete retained
endpoint values; clearing a clock or zone never clears location or provenance.
Local times use plain ISO text, preserving optional seconds and fractional precision.
Only explicit draft changes save on blur; untouched fields never normalize source values.
Journey and leg notes support multiple lines.
Mode remains open source text, and intention, arrangement and purchase are independent.
Only Purchased receives hard styling. Optional buffer fields have no default.

Inline field edits and whole-card ordering persist to the owning source endpoints.
Undo submits guarded inverse PATCH/order writes. Adding a blank leg can be undone
through a server-owned reversible removal receipt for that newly created identity.
The leg card’s Remove control uses the same receipt and persisted Undo to restore
the original identity, ordering, purchase and provenance. Every leg write uses the
atomic leg-list revision. Inverse guards advance only across the editor's own confirmed
successor revisions; a later refetch or receipt replay cannot lend its revision to Undo.
Consecutive removals restore in LIFO order with stable identities and exact live ordering.

Failed source edits and receipt-backed removal/restoration retain their exact command
for explicit retry, including the original operation ID and revision. A revision conflict
invalidates inverse history. Ambiguous leg creation still requires a successful canonical
source reload before another write, preventing blind create retries. Cached source remains
mounted during background failures. Only the owning timing endpoint supplies chronology
findings and signed minutes; unavailable or incomplete clocks do not imply safety.

Alternative editors preserve independent journey identities and display every explicit
matching group. A host with literal source routes supplies `onViewJourney` to replace
the URL after a successful selection. Undo retains the prior selected identity, original
viewed source and the operation's exact returned revision above source-editor state;
unrelated refetches never rebase that inverse. It restores the original viewed source
only after the inverse succeeds. Manual navigation invalidates the local selection
history, and no Undo is promised after leaving or reloading the workspace. Late source
or selection responses cannot replace a manually chosen view. A new option is an empty
source, never a clone of the working journey. Ambiguous grouping writes block further
grouping mutations until an explicit canonical reload succeeds; pending or failed reads
retain that guard, including across manual source navigation.
Opaque source references display their original labels/URIs without asserting document
resolution. Nearby bookings and buffer-safety findings are owned by POPS-6134.

`@pops/trips-workspace` exports `StayWorkspace({ tripId, stayId, client? })`, the approved
In visit accommodation workspace. This browser component library owns no service or database and imports no pillar package.
Its consumers supply source identities and a React Query provider; shell activation
is tracked separately.
`EventWorkspace({ tripId, eventId, client? })` implements the approved route-context
event detail. It places the editor inside its explicit associated visit and shows
the immediately neighbouring visits in persisted route order. Missing associations
remain unlinked; event dates never move visits or create journeys. Intention,
arrangement and purchase save independently, and only Purchased has hard styling.
Event dates, clocks and zone remain independent source fields. Source/ticket URLs,
address, notes and opaque source/venue/organiser/document references are editable;
no reference is hydrated or treated as an external booking action. Undo persists
the previous successful event source snapshot. Failed drafts remain visible and
retryable; optional context failures do not prevent editing.
The generated Trips client uses `/trips-api`; an explicit generated `Client`
may be supplied for a separate transport. No backend contract types are imported
into the browser: the committed Trips OpenAPI snapshot owns the generated types.

Fields save on blur; selecting a kind, status or visit saves that explicit choice.
Each date, clock and zone remains independently optional. Clearing a timing field
removes only that member while submitting the complete retained timing object.
Empty scalar choices clear to null. No visit dates or default clocks/zones are
copied. Only Purchased receives hard styling. Undo persists the previous successful
source snapshot; failed drafts remain visible with safe diagnostic codes and retry.
Successful mutations update the source cache. Fresh source reads replace an untouched
editor; pending drafts survive background reads. Context failures do not block editing the stay. Neighbours share an explicit
visit identity; an unlinked stay implies no accommodation coverage.

Existing host/document/provenance links are displayed and can be removed. Their
opaque source identifiers remain intact, and the workspace asserts no resolution
or external booking action. Source-owner picker integration is POPS-6156.

Run `mise exec -- pnpm --filter @pops/trips-workspace dev` for the standalone development
harness, then enter real trip/stay IDs. Its proxy targets the local Trips API on
3018, configurable with `TRIPS_DEV_API_ORIGIN`; API authentication remains required.
The harness is a development entry, not shell navigation. Shell routes, remote
assets and deployment activation are tracked by POPS-6155. Activity context is
tracked by POPS-6134; derived stay findings remain under POPS-6147.

`CalendarWorkspace({ tripId, locale, onOpenSource, client? })` projects complete journey,
workspace/group, stay and event reads onto the approved clock rail. Its host opens
exact source identities. Only explicit journey groups exclude alternative journeys;
every event intention remains visible. Source clocks and zones remain independent.
Journey workspace reads atomically couple source metadata and live legs to their
exact timing projection. Foreign identities or incomplete timing membership fail
with a retryable diagnostic instead of invented unknown clocks.
The user chooses a display zone, inclusive date bounds, kind, and optional journey
window. Journey windows come directly from usable owning timing projections.
Floating dates are never midnight instants; complete skipped/repeated source clocks
remain unresolved. Recorded boundaries and clipped ongoing intervals keep projection
work proportional to sources rather than the number of days selected. Stay occupancy
ends before checkout. Floating Event endpoints imply no intermediate occupancy. Unknown dates and chronology issues remain available to open.
Required read failures never become empty collections; failed background refreshes
retain the last complete read and explicit retry. The standalone `/calendar/:tripId`
route mounts this workspace; source opening targets the shell's literal source paths.

The approved options-first `DecisionWorkspace` loads a decision and its live options
from one transactional producer snapshot. It writes only explicit fields, keeps the
deadline date-only, and never changes linked visits, journeys or stays when choosing
or reopening a decision. Optional context failures remain independent. Unavailable
stored memberships retain their exact kind and identity and may be removed without
revalidating other retained links. An option's persisted validated membership
history permits guarded restoration of an unlinked unavailable source; genuinely
new memberships require live sources in the owning trip. Currently live foreign
ownership is rejected even for a historical identity. Provenance URIs remain opaque.

Inline fields save on blur and Escape discards the draft. Failed writes and cached
read failures retain drafts and diagnostics. A newer source arriving during edits
requires an explicit reload and review; changing the API origin or owning record
starts a new editor. Undo uses only confirmed own successor revisions under the
producer's exact one-step revision protocol. Selected-option removal restores the
same option identity and prior selection atomically. A confirmed newer revision
or revision conflict clears stale Undo. Transient failures retain inverse intent;
retries keep their original revision, including after an unchanged refresh, and
cannot silently rebase an uncertain create or inverse. The host supplies the parent
navigation link and authenticated query/client context.

`@pops/trips-workspace/decision-client` exports the headless decision controller
and its generated-transport load/apply operations. The owning Trips app runs the
real editor/HTTP/SQLite integration regression; this extractable library does not
install or start a pillar runtime in its own unit tests.
