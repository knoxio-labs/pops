# Trips workspace components

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
In visit accommodation workspace. This browser component library owns no service or
database. Its Contacts chooser is an opaque host-injected capability; the library
imports no pillar implementation. Persisted Trips types come from this library's
generated client.
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
or external booking action. Typed Documents originals are separate from these opaque references.

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

`CaptureWorkspace({ tripId, view, client?, documentsClient?, backHref?, onViewEvent? })`
provides the text-first Capture, inline Inbox and Explore views. Its session is scoped
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
Hosts supply `renderLink` and optional `navigation` for client-side transitions; a full
page reload ends the browser session and cannot restore File handles.

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
