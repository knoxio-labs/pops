# Trips browser app

The shell loads `dist/remote/trips.js` and `trips.css` from the Trips manifest. The app exposes the grouped home, trip metadata settings, a trip calendar, and route adapters for the `@pops/trips-workspace` visit, stay, journey, event, and options-first decision editors. Event detail is registered at `:tripId/events/:eventId`; invalid route identities fail before making source requests. The `/trips/:tripId/documents` route provides typed document associations and owner uploads. It owns no database and uses generated Trips and Tags clients at the shell's authenticated same-origin proxy paths.

`:tripId/arrangements` publishes the `trips-arrangements` slot. Its adapter validates
the owning trip identity and supplies shell-selected translations and calendar locale
to the route-grouped workspace. Only explicit Visit associations group sources;
Journeys remain separately identifiable until their producer owns Visit placement.
Opening an arrangement uses its actual source editor and independent responsibility
writes; no external booking action is performed. The shell may inject the shared
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

Home groups use the first ordered visit's arrival and the last visit's departure, relative to the viewer's local calendar day. Missing, invalid, or contradictory outer dates remain in Other. Trip titles use trimmed custom name, then trimmed destination, then the translated Trip label. `when` is opaque source text and never supplies route dates.

Creation is permanent: a successful POST selects the returned trip and offers no Undo. Failures and background refresh errors preserve the draft; explicit Cancel clears it. Settings save with PATCH, omit source links, and offer Undo of successful metadata edits using another PATCH. Blank optional associations and unchanged stored references do not require their catalogues to be available. Settings PATCH omits unchanged references; unavailable stored identities remain visible without claiming resolution. Explicit parent and tag selections must be valid source choices; the server remains authoritative for cycle and tag validation.

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

`PeopleContext({ tripId, contacts?, client? })` supplies Trips translations and
forwards the owning trip, transport and opaque Contacts host capability to the
shared workspace. It is a contextual component for the Trip Timeline; it publishes
no independent People route or remote page slot. The shared workspace owns exact Visit grouping,
independent meeting edits, durable retry and confirmed source Undo. It imports
no Contacts implementation into this app. The meeting persistence regression
drives the public headless editor through the generated HTTP client and the
owning SQLite producer, including a lost response after a committed create.

## Visit sources

`/trips/:tripId/visits/:visitId` mounts `VisitWorkspace` with literal source identities.
The selected-trip preview links each distinct visit occurrence to that route.
Visit navigation replaces the source URL; accommodation links open the existing stay route.
Timing edits and Undo write only the visit, guarded by its confirmed source revision.

## Calendar

The selected trip preview links to `/trips/:tripId/calendar`. Its exported calendar
workspace reads independent journey, stay and event sources through the generated
Trips transport, requires an explicit display zone, and opens exact owning editor
routes. Unavailable collections render retryable errors, retaining a prior complete
read during refresh failures. Calendar date bounds remain separate from resolved
source clocks; the optional journey window uses the owning timing endpoint.
