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

`ArrangementsWorkspace({ tripId, labels, formatDate, client?, ContactChooser? })`
groups independent Stay, Event and Rental sources by their explicit Visit occurrence
in persisted route order. Repeated places retain separate occurrences. A Rental
appears once at pickup, with an internal pickup/return timeline. Unavailable Visit
references and unset associations remain visible separately. Journeys retain their
own section because their contract has no Visit binding; matching endpoints, places
and dates never place one on the route. Journey purchase styling belongs to each
ordered leg, and only an explicit Purchased source receives hard styling.

The host supplies translated controls and locale-aware calendar formatting. Search
and filters preserve the source collections. Source requests fail independently and
retain cached rows; an unavailable collection never becomes an empty catalogue.
Opening a row composes the existing Stay, Event or Journey editor with independent
revisioned responsibility controls. A stale Contacts URI can be cleared without
Contacts, and optional assignment failures never block those source editors.
Rental edits use the canonical rental revision, preserve failed drafts and exact
retry bodies, and persist Undo against the confirmed successor revision. A newer
source requires an explicit canonical reload before further edits.

`visit/coverage` is the shared checkout-exclusive accommodation projection. The
explicit source-state policy is Agreed, Reserved and Purchased covering nights;
Considering remains an idea. It retains every candidate and activity, including
unplaced sources. Valid arranged stays prove coverage even when neighbouring
sources have uncertain dates. Uncertain arranged or unset sources, unknown Visit
bounds and incomplete source loads prevent unsupported missing-night claims.
Considering dates never mask a proven gap. Coverage findings use only the real
bounded Visit interval; no clocks, zones or route placement are inferred.

Arrangements coalesces adjacent identical findings and opens one dotted action per
proven gap. Selecting it captures a real Stay for that exact Visit and interval,
then opens the canonical editor. A known creation receipt retains its source ID;
selecting the same action reopens it rather than repeating POST, including after
capturing other gaps. Receipts belong to each explicit Visit/date action for the
current owning-trip/API session. A lost creation
response remains uncertain even after an empty source reload or a matching later
record. Reload never claims that record as the created source. Existing sources
remain explicitly selectable, and starting a new capture requires a separate
conscious action for the currently selected uncertain gap; that action itself
performs no POST and preserves every other gap receipt.

Stay, Journey and Event editors provide the sole canonical document link and
upload controls for that exact source. Arrangements resolves the same target-
and transport-bound queue from the shared source registry for the QueryClient's
lifetime, across dialog close, source switches and query-cache eviction.
File handles and accepted task identities stay with the original target;
Rental has no document association target. The workspace does not copy upload
forms, pollers or recovery rules.
Changing either owner client instance, owner origin or trip closes the active
source view. Its queue remains dormant for that exact original context; only an
explicit reopen under the same context restores its files. Document controls
validate the current host context against the retained owner's queue before mounting.
Gap creation and responsibility controllers also remain above keyed source views,
scoped to the exact original client, origin and trip. An inactive context cannot
retry, reset or reload its operation through the current owner. Late responses
retain their own receipts without updating another context's cache or selection.
Source-opening callbacks are fenced by host and selection generations, so a late
Stay response cannot close a newer source editor or discard its draft, including
after an A→B→A transition.

Visit titles and Rental endpoints use persisted route occurrence positions, while
their actual IDs remain source identities. Opaque Contact references use a neutral
Contact label when the host omits the optional owner reader. The SDK capability
resolves actual owner names and navigation; missing, unavailable and read-error
states remain distinct. Card labels stay passive and the responsibility editor
uses only an owner-issued href. Reference details preserve
the original URI independently of Contacts availability. The host supplies a
retained SDK picker intent for each responsibility target. Its controlled owner
picker supplies the selected canonical URI; no raw URI entry or Contact form is
implemented here. Closed or unmounted picker views cannot initiate responsibility writes. The
workspace retains per-target PUT payloads, expected revisions, pending outcomes
and their successful receipts above source dialogs. A Contact PUT may return the
producer-verified canonical redirect; that returned URI belongs to the actual
response, while retry keeps the originally selected input. Reloading identical source
fields never acknowledges a lost response. Failures expose detached source snapshots; retry uses the controller-owned
immutable request. Retry preserves the original request;
starting a new responsibility change explicitly reconciles the current source
without claiming the abandoned write succeeded. A known write receipt or that
explicit reconciliation permits a fresh owner picker intent on the next Choose
contact action, while previous owner receipts remain retained.

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

`@pops/trips-workspace` exports `StayWorkspace({ tripId, stayId, formatNights, client? })`, the approved
In visit accommodation workspace. This browser component library owns no service or
database. Its Contacts chooser is an opaque host-injected capability; the library
imports no pillar implementation. Persisted Trips types come from this library's
generated client.
The host supplies `formatNights(count)` from its active locale; the library passes only
known positive checkout-exclusive calendar-day counts. The Trips app uses its own
i18next singular/plural resources. Incomplete dates never receive a count.
Its consumers supply source identities and a React Query provider; shell activation
is tracked separately.
`EventWorkspace({ tripId, eventId, client?, contacts? })` implements the approved route-context
event detail. It places the editor inside its explicit associated visit and shows
the immediately neighbouring visits in persisted route order. Missing associations
remain unlinked; event dates never move visits or create journeys. Intention,
arrangement and purchase save independently, and only Purchased has hard styling.
Event dates, clocks and zone remain independent source fields. Source/ticket URLs,
address, notes and opaque source/venue/document references remain editable.
Organisers use the host-injected Contacts chooser and owner reader. Only an owner-issued
reference is appended; existing opaque organiser values and exact removals remain intact.
Passive names and hrefs come from successful owner reads, with separate missing,
unavailable and read-error states. No person/organisation type restriction is inferred.
Organiser selection never changes booking responsibility or another Contacts record.
Owner intents and issued selections survive chooser close, source-write failure and
route unmount for the Shell QueryClient's mount lifetime, outside its query cache.
An unresolved owner intent is resumed; a retained issued reference can be explicitly
reapplied without creating a global contact again. Source/client/capability replacement
isolates those intents, and late closed-view callbacks do not write into another source.
The chooser's local Suspense keeps source drafts mounted during owner UI loading. Undo persists
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
editor; pending drafts survive background reads. Untouched top-level fields adopt fresh
canonical values, including complete Host arrays. Overlapping local and canonical changes
block source writes until the user explicitly discards only the conflicting draft fields.
Unrelated pending edits and owner receipts remain retained. If an older save response
arrives after a fresh read, conflict resolution keeps the observed field facts separately
from the exact write acknowledgement and never grants its revision to a failed retry.
A fresh source invalidates
stale whole-source Undo history; own mutation echoes retain it. Failed operations keep
their original confirmed save baseline for retry, including Visit revision guards. Context failures do not block editing the stay. Neighbours share an explicit
visit identity; an unlinked stay implies no accommodation coverage.

Stay Host references use the same host-injected Contacts chooser and owner reader as
Event organisers. Selection appends the owner's issued URI; explicit replacement and
removal affect only the chosen occurrence, preserving all other opaque source values.
Host choices never rewrite the stay address, provider facts or Contact records, and no
Contact type or reference-count restriction is inferred. Unknown owner outcomes resume
their retained intent; issued references survive failed Trips writes and route unmounts.
A replacement pending against an altered source array cannot write into another row;
its issued reference remains available for explicit recovery. Source labels are retained
as provenance details, while names and hrefs require an actual successful owner read.
Empty read-only Documents/Sources provenance groups are omitted. Stored opaque values
remain removable; typed Documents originals have their own owner-backed actions.

`TripDocumentsWorkspace({ tripId, target? })` and `DocumentAssociationPicker` use the
typed Trips association contract and a separate generated Documents client. Trip-wide
originals are listed first, followed by groups for their exact visit, journey, stay or
event identities. Search and metadata come from Documents; opening an original uses
its authenticated download route. Unlink removes only the Trips association. Uploads
use the current Documents MIME and size policy. The always-visible multi-file drop area
sits beside the square existing-original picker. Each selected file has its own task,
error and captured target, including distinct files with identical names. Accepted tasks
survive switching source context, and completed files are never resent when
another file fails. Uploads retain the accepted task identity while
processing, and attach only after the owner returns a canonical document ID. An
interrupted upload is treated as an uncertain outcome and requires searching Documents
before another upload is considered. Existing links remain visible while Documents is
unavailable; metadata does not imply offline file availability. The Trips app exposes
the workspace at `/trips/:tripId/documents`; source editors can reuse the picker with
their explicit target identity. `TripDocumentLinks({ tripId, target?, tripsClient?,
documentsClient? })` renders only the exact trip, target kind and target ID when a
target is supplied, without route lookups or another page shell. Editors compose
it with `TripDocumentUpload` using the same explicit target and owner transports.
Journey, Stay and Event editors embed these owner components for their explicit
persisted source identity. Links never imply inheritance from a visit. Document
operations retain the independent source draft, failed-save retry and persisted
Undo history. Hosts may supply `documentsClient` separately from the Trips `client`;
unavailable originals do not block source edits.
Conditional dialogs, collapses and routes retain a queue above the view with
`createTripDocumentUploadSession({ tripId, target, tripsClient?, documentsClient? })`
and pass it through `TripDocumentUpload`'s optional `session` prop on every mount.
Key host storage by the exact trip, target kind/ID and owner client identities and origins.
A host with a supported authentication-switch path must reset storage on that transition;
transport changes require a separate queue. Reloading releases these in-memory queues.
The queue keeps distinct File handles, pending requests, accepted tasks and uncertain
outcomes across unmounts; overlapping views observe the same selections and upload
claim. Supplying a different target, client identity or owner origin throws
`TripDocumentUploadContextError`
before any owner action. Queues are live browser objects, not serializable drafts.
Uploads, task reads, picker searches, linking and recovery recheck that captured
context immediately before the operation, including mutable default clients.
Without the prop, the component keeps its existing view-local queue behavior.
Source upload queues are retained outside the query cache for the Shell QueryClient's
mount lifetime, including route/card unmounts and query eviction. Exact trip, target
kind/ID, client instances and owner origins isolate queues; replacing a client or
origin creates another queue. Full page reload releases browser File handles and
receipts. This lifetime follows the current Shell, which has no supported in-app
account-switch/reset contract; it does not establish an authenticated-principal scope.
`DocumentPicker({ onSelected, documentsClient? })` returns the actual owner original
without writing a route association. `useDocumentUpload({ session, onSessionChange,
documentsClient? })` is the same per-file owner workflow used by route uploads.
Initialize each distinct intent with `createDocumentUploadSession(file)` and keep
its controlled session above conditional views: its pending POST flag, accepted task
and uncertain response guard must survive navigation and remount. Each initializer call
creates an immutable intent identity, even for the same File object. Session fields are
live receipt getters: retain the session itself for Undo; never spread or serialize it.
Late results update that originating receipt without selecting it over a replacement.
Overlapping views share one synchronous POST claim per intent; separate selections
remain independent. The session retains
the exact browser File handle; only actual task/document identities belong in persisted
provenance. Completed and explicit duplicate task results expose the canonical document
ID while retaining the accepted task ID. Verified owner task results also remain in
the receipt when its query cache is evicted; pending task lookup resumes on remount.
An older read without a canonical identity cannot erase a verified original.
Retained task query namespaces stay bound to the file intent's captured owner;
a mutable client origin change cannot seed that proof into another owner's cache.
Separate recovery pickers pass the controller's `assertOwnerContext` to
`DocumentPicker.beforeRequest`, preserving the same transport and retaining-parent guard
for owner searches and cached selection callbacks.
The controller never repeats an accepted or
uncertain upload; a definite rejection can be retried explicitly.

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

`@pops/trips-workspace/capture-client` exports the headless shared Capture, Inbox
and Explore editor. It submits finite action-specific owner commands with retained
operation UUIDs. An uncertain response blocks a new operation until the same request
is resolved; retry never substitutes revisions from a newer read. Receipts distinguish
the immutable original outcome from current affected rows and an already-undone replay.
Reads started before a confirmed mutation cannot replace its current source state.

The composer retains verbatim source text, explicit optional selections and distinct
File handles in this browser session. Every selected file needs an accepted Documents
task or original identity before capture; later task completion retains both identities.
Confirmed capture Undo restores its submitted draft only when the current composer is
empty. The composer stays reserved during an uncertain inverse. Recapture creates a
new operation UUID while reusing accepted references, without another upload. No file
bytes or Undo history survive a browser reload. Organisation, source edits and collection
removal use the producer's guarded inverses without restoring an old whole workspace.

`CaptureWorkspace({ tripId, view, client?, documentsClient?, contacts?, onViewEvent? })`
provides embedded text-first Capture, inline Inbox and Explore tool views for the owning
Trip workspace. The host controls the view and Event callback; the tool renders no
page landmark, back navigation or destination links. Its session is scoped
to the host QueryClient, API origin and owning trip. Optional catalogue failures stay
separate from the source read. Inbox keeps raw material visible while saving explicit
fields and typed existing/new Idea, Event, Journey or Stay organisation. Classification
alone stays unorganised; unresolved external references retain their canonical identity.
An unverified external owner is distinct from a missing local target. Canonical Contact
selection supplies evidence for its retained browser intent; after reload the owner
availability stays unverified until an owner read confirms it.
The optional host reader resolves retained Contacts URIs through their owner. Duplicate
references share a read within this trip session; missing identity, unavailable transport
and invalid owner responses stay distinct. Explicit read retry does not mutate Trips or
rewrite historical URIs, and source navigation uses only the owner's returned route.
Once an owner read completes, pending refreshes cannot reuse earlier chooser evidence
to mark an unverified association organised.
Failed row edits and target descriptions survive filters and navigation with their
original preconditions. Upload views compose the Documents owner's controlled session;
remounting a pending upload cannot issue another POST.
Ambiguous-upload recovery searches and selections use that same session's published
owner-context guard, so changing its Documents transport cannot accept another owner's original.
The host may unmount or change the controlled tool view without replacing its QueryClient.
A full page reload ends the browser session and cannot restore File handles.

Explore reads actual Capture, Idea or Event membership identities and groups by the
current source's recorded place, or an Event's explicitly selected visit place. Identical
place names remain distinct. Unassigned and unavailable references remain separate.
Inline detail edits the recorded Capture or independent Idea; Event opening is delegated
to the host's published source route. Removing a membership never deletes its source.
Explicit Idea kind selection in the composer creates and associates that subtype in
the same owner operation, preserving both IDs and verbatim raw text. Its explicitly
selected place/visit is submitted on both records; later edits do not synchronize them.

Idea detail retains source links, canonical Contacts references and recommendation
notes as explicit fields. Optional timing and location discrepancies produce findings
without blocking unrelated edits. Mutable reference text keeps its editing identity
while typing; failed writes retain the exact draft and original source revision.
Contact selection and creation use a host-injected opaque owner intent, which supplies its own
catalogues to the host locale. Each organisation intent retains the owner session above
route views, including pending creation and ambiguous outcomes. The canonical reference
is retained before a Trips association is attempted; retrying the association cannot
create the Contact again. Removing a Trips reference never deletes a Contacts record.
An Idea Contact or recommendation link remains explicitly retryable while another
Trips operation is pending. Its canonical selection is immutable per intent; only
confirmation for that operation UUID, Idea, original revision and submitted canonical
link marks it applied. An uncertain link response resolves through the editor's retained
request replay before that link can be replaced. Explicit replacement of an unsent or
rejected link creates a new intent and removes only its own prepared entry. The old owner
receipt remains retained. Discarded link drafts require an explicit restore, which adds
only the selected canonical link to current edits without restoring discarded fields.

`PeopleWorkspace({ tripId, meetingId?, text, contacts?, client? })` implements
the approved People grouping by persisted Visit occurrence order. Repeated places
keep separate occurrence identities; unassociated and unavailable Visit references
remain separate. Contact identity, title, notes, intention, agreement and date-only
bounds are independent source fields. Missing and reversed dates remain editable
facts; no availability, agreement or route placement is inferred.

An optional canonical `meetingId` focuses the existing row within the exact owning
trip and API origin. An unavailable or foreign-trip ID
never falls back to another meeting. Omitting it retains the full grouped workspace.
Unsaved title, notes and date text belong to the retained editor session, including
across context unmount/remount; changing the selection does not create another editor.

The host injects the SDK's opaque Contacts chooser capability. Each explicit choice
retains its owner session across close/reopen and route remount, including unknown
creation outcomes. The library imports no Contacts implementation. An optional
owner reader supplies retained Contact names and source links; unread identity stays
unverified. Resolver-confirmed missing identity remains distinct from unavailable or
failed metadata reads, which retain any separately proven canonical reference. Existing plans
remain editable and clearable when owner context cannot be loaded.

Meeting writes use durable operation UUIDs and exact source revisions. Failed writes
retain the same command across route remounts and retry; uncertain creates cannot
be released by reload. Definitively rejected writes require an explicit successful
canonical reload before another command. Undo targets only confirmed own receipts
in LIFO order, including source removal and restoration of the same identity.
Every write, retry and Undo checks the captured transport's current API origin at
point of use. A changed origin sends nothing and retains the exact command and
receipt history; restoring the original origin permits explicit exact retry.
The generated default transport uses its actual configured origin as well.
`@pops/trips-workspace/people-client` exports this headless editor and generated
transport operations for the owning app's HTTP/SQLite integration regression.
`VisitWorkspace({ tripId, visitId, client?, onViewVisit?, onViewStay?, onViewEvent? })`
exports the approved direct visit editor and accommodation-period workspace.
Exact dates, approximate month/part and one-sided duration bounds remain independent.
Fields persist on blur or explicit selection; optional fields do not acquire defaults.
Visit PATCH and Undo supply the exact confirmed source revision. A foreign canonical
refresh clears local history; pending or failed drafts retain their original precondition.
An explicit reload discards local draft/history only after a successful source read.
Creating a reusable city retains its acknowledged identity if visit association fails;
retrying that association never repeats creation. Undo restores the prior association
without deleting the reusable city. An ambiguous creation failure blocks another POST
in that session while allowing a canonical city reload and explicit source selection.

Accommodation periods use explicit visit IDs and checkout-exclusive stay dates.
Unknown, partial or contradictory dates remain visible without asserting coverage.
Agreed, Reserved and Purchased accommodation covers nights; Considering stays remain
visible as ideas without covering them. Only Purchased has a solid boundary. Missing
accommodation uses the shared coverage classifier and names only the proven interval
inside valid visit bounds. Unknown dates or context prevent unsupported missing-night
claims without weakening coverage established by independently dated arranged stays.
Activity placement uses its explicit visit ID and start date, includes every intention, and retains uncertain/outside-period sources separately.
Source arrangement dates are never clipped or rewritten to match visit dates. Day focus
accepts any valid calendar date and only changes the projection. Journeys without an
explicit visit association remain outside this view; no place-label/date matching is used.

Visit UI copy consumes the host i18next `trips` namespace, including the app-owned
`visitWorkspace` catalogue in both supported locales. Calendar labels use the host
resolved language while retaining literal source days without viewer-zone conversion.
