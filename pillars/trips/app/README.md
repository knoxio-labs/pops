# Trips browser app

The shell loads `dist/remote/trips.js` and `trips.css` from the Trips manifest. The app exposes the grouped home, selected-Trip Timeline, trip metadata settings, and route adapters for the `@pops/trips-workspace` visit, stay, journey, event, options-first decision editors. It also exports router-free Capture tools. Event detail is registered at `:tripId/events/:eventId`; invalid route identities fail before making source requests. The separate Documents list is registered at `/trips/:tripId/documents`. The public router-free `CaptureContext({ tripId, view, selectedSource?, client?, documentsClient?, contacts?, onViewEvent? })` embeds the same retained engine in its owning Trip workspace. It publishes no Capture, Inbox or Explore destination or navigation; host placement and controlled view changes belong to the Trip workspace.

The Documents route provides typed document associations and owner uploads. It owns no database and uses generated Trips and Tags clients at the shell's authenticated same-origin proxy paths.

The selected Trip owns one Timeline at `:tripId`. People, Capture, Inbox and Explore
open canonical contextual tools beneath the same shell QueryClient. Source rows open
the existing canonical source editor in a sheet; nested source jumps replace only the
selected source identity. Documents is the separate Trip list shortcut. The existing
`:tripId/arrangements` URL and `trips-arrangements` slot load this same Timeline.
Source detail URLs remain available for existing links. The header metadata action
opens the canonical settings form in the same sheet; it does not add a Trip destination.
Add to timeline opens a progressive source chooser in that sheet. Visit creation requires
an explicitly selected reusable Place; capturing a new Place is a separate acknowledged
operation before creating the Visit. Journey, Stay, Event and Rental capture only the
initial name or provider and then open their existing editors. No dates, booking states
or route placements are inferred. Non-idempotent creates retain drafts and dispatched
outcomes per QueryClient, actual transport, captured origin, Trip and source kind.
A lost response locks creation until the user explicitly starts another; a confirmed
record can be reopened without another POST. Direct Idea creation uses the canonical
Capture operation UUID and retained retry engine, independently of the Capture composer.
An already-dispatched validated acknowledgement settles its original session and cache
even after the live connection changes; only a current view may open the returned source.
Whole Journey, Stay, Event and Rental contexts reuse the independent Handled by controls;
Rentals have no Documents target. Route controls use the canonical retained UUID/revision
controller for explicit gaps, moves, complete order, alternative paths, apply and Undo.
A mutable Trips-origin change rejects stale source-opening callbacks.
Resolved Visit contexts reuse canonical accommodation coverage even when route placement
is unavailable. A confirmed gap create opens the acknowledged Stay in the existing sheet.
The owner provider retains uncertain creation state across sheet and Trip remounts;
reloading source facts does not acknowledge a lost create response or repeat its POST.

The reusable Arrangements workspace retains its independent responsibility writes;
no external booking action is performed. The shell may inject the shared
Contacts capability through `RemotePageHostProps`. The adapter retains one opaque
owner picker intent per exact trip/source responsibility target across dialog
remounts. An acknowledged responsibility PUT or explicit source reconciliation
allows the next Choose contact action to start a fresh owner intent; prior owner
receipts remain retained. An owner selection alone never advances the intent.
Only an owner-issued selection supplies the canonical reference; cancelling
or reopening does not write Trips. Self and clearing a stored reference remain
independent of Contacts availability. The same optional SDK capability supplies
passive reference reads; verified names and links come from the owner, while
unverified or unavailable references retain their original source identity. Source
dialogs reuse the shared document controls only for Stay, Journey and Event, with
upload sessions retained above dialog lifetime for each exact target and owner
connection.

Home selection and successful creation open `/trips/:tripId`, the approved route-first
overview. It loads the owning library's independent source collections and links only
to published source routes. Calendar and Documents navigation remains available even
when their source collections are empty. Stays and events attach only through explicit visit
identities; journeys stay separate until a placement contract exists. Missing or
unassociated facts remain visible, and document associations retain source identities
without pretending to resolve Documents originals. The overview's When subtitle is
opaque; its displayed outer dates come from ordered visit bounds.
The shell supplies the overview library's utilities through the shared theme,
outer page padding and shared component styles. The remote stylesheet scans only
the Trips app's source.

Home groups use the first ordered visit's arrival and the last visit's departure, relative to the viewer's local calendar day. Missing, invalid, or contradictory outer dates remain in Other. Trip titles use trimmed custom name, then trimmed destination, then the translated Trip label. `when` is opaque source text and never supplies route dates.

Creation is permanent and uses `POST /trips/operations`, with no Undo or fallback to plain POST. Each submitted attempt retains its UUID and immutable explicit fields. Try again repeats that exact command. During unresolved recovery the form displays those submitted fields disabled; Close hides without forgetting the attempt. A later local draft remains separate and is not erased by that attempt's acknowledgement. Only the producer's explicit parent-invalid or tag-unknown rejection permits correcting the fields or cancelling that rejected attempt; other failures retain the command for recovery. If a definitely rejected attempt already has a newer draft, that draft remains visible and Create starts a new command; Retry is offered only when its submitted fields match the displayed draft. A matching HTTP 201 receipt verifies the original input, while its separate current Trip supplies cache admission and selection. Omitted defaults remain producer-owned and When stays verbatim.

Creation state follows metadata's host QueryClient, actual Trips client and captured-origin boundary, independently of view closure or cache eviction. This is in-memory retention, not browser persistence or an authenticated-principal boundary. Mutable transport changes cannot retarget Retry. An accepted original-owner response remains retained after closure or connection changes; only an open view with active original-owner proof may cache, clear the matching submitted draft and select the current Trip. Settings save with PATCH, omit source links, and offer Undo of successful metadata edits using another PATCH. Blank optional associations and unchanged stored references do not require their catalogues to be available. Settings PATCH omits unchanged references; unavailable stored identities remain visible without claiming resolution. Explicit parent and tag selections must be valid source choices; the server remains authoritative for cycle and tag validation.

Metadata state is retained per host QueryClient, actual Trips client, captured origin and trip, independently of view closure and query-cache eviction. Multiple views share the same draft, pending write and confirmed own inverse stack. A failed or uncertain PATCH retains its exact body for Retry even if the draft changes afterward. An already-dispatched matching acknowledgement settles its original session and cache even after navigation to another connection. Only a matching validated HTTP 200 establishes a saved edit and its Undo; another PATCH applies that confirmed inverse. Plain PATCH provides no server UUID deduplication or compare-and-swap protection against unseen concurrent writes. Guarded metadata reads use a distinct raw Trip key; retained source fallback does not claim a successful GET.

A failed refresh with cached trip data keeps the current view and editor mounted and displays a retryable error. An initial read failure renders the source error without editable fabricated data.

Query keys include the owning API origin and match the stay library for trip and visit sources. Route-context failures do not prevent trip metadata browsing or creation. Parent and shared-tag catalogue failures are independent from the trip source request.

Decision detail is published at `:tripId/decisions/:decisionId` through the
`trips-decision` remote slot. Its transactional source read, revision-guarded writes,
draft retention and identity-preserving Undo belong to the workspace library. The
adapter supplies only real owning identities and the published Trips parent path.

Run the unit's discovered mise tasks for tests, typecheck, and the isolated remote build. Production serves the built assets through `Dockerfile` and nginx. The repository compose files wire the UI and the Trips API's mounted SDK credential; provisioning the registry account and host secret follows [the Trips secret runbook](../../../infra/secrets.example/trips/README.md). Neither the app build nor compose creates credentials.

## Journey sources

`/trips/:tripId/journeys/:journeyId` mounts the exported source-backed
`JourneyWorkspace` with validated owning identities. The route reads generated Trips
REST operations and does not infer mixed route placement or alternative membership.
Use journey replaces this literal source URL after selection succeeds; selection Undo
persists its own revisioned inverse before restoring the original viewed URL.

The decision persistence regression belongs to this app's integration boundary:
it starts the owning Trips producer fixture and drives the public headless workspace
editor through this app's generated client against SQLite. Both dependencies already
belong to this app's declared graph, so filtered CI installs include the producer's
native SQLite runtime without adding a lib-to-pillar dependency.

`PeopleContext({ tripId, meetingId?, contacts?, client? })` supplies Trips translations and
forwards the owning trip, transport and opaque Contacts host capability to the
shared workspace. It is a contextual component for the Trip Timeline; it publishes
no independent People route or remote page slot. The shared workspace owns exact Visit grouping,
independent meeting edits, durable retry and confirmed source Undo. It imports
no Contacts implementation into this app. The meeting persistence regression
drives the public headless editor through the generated HTTP client and the
owning SQLite producer, including a lost response after a committed create.

## Visit sources

`/trips/:tripId/visits/:visitId` mounts `VisitWorkspace` with literal source identities.
The Timeline opens each distinct Visit occurrence in context; this source URL remains available for existing links.
Visit navigation replaces the source URL; accommodation links open the existing stay route.
Timing edits and Undo write only the visit, guarded by its confirmed source revision.

## Calendar

Calendar is a controlled filter inside the Timeline. The existing
`/trips/:tripId/calendar` URL and `trips-calendar` slot load the same Timeline with
calendar controls enabled. Toggling the controls retains the explicit range, zone,
source-kind and Journey selections for the mounted Trip. The source-backed calendar
requires an explicit display zone and opens exact owning editors in context. Unavailable collections render retryable errors, retaining a prior complete
read during refresh failures. Calendar date bounds remain separate from resolved
source clocks; the optional journey window uses the owning timing endpoint.

The public `CaptureSourceSelection` union selects an exact persisted Capture or Idea ID and opens its existing editor. `selectedSource: undefined` or `null` leaves the ordinary tool view; a missing or removed selected source stays unavailable without falling back to a different row. Contextual source changes retain owner-scoped drafts, unknown operation UUIDs and Undo history. Retained writes/retries/Undo are fenced to the original effective Trips origin, including the default client; a same-origin replacement client is supported.

Each contextual view also captures its read/cache owner. Mutable origin changes cannot refetch another owner beneath the old key or deliver foreign cached data into its editor. Restoring an unavailable owner keeps its last good source and pending commands. An accepted in-flight write is retained, and invalidation stays with that write's original cache scope.

Optional Place/Visit choices share the captured workspace owner and cache proof. Their failures retain last verified same-owner options and do not block raw capture; owner changes cannot substitute foreign catalogue labels or occurrences beneath a retained source.
