# Trips browser app

The shell loads `dist/remote/trips.js` and `trips.css` from the Trips manifest. The app exposes the grouped home, trip metadata settings, and route adapters for the `@pops/trips-workspace` stay, journey and event editors. Event detail is registered at `:tripId/events/:eventId`; invalid route identities fail before making source requests. It owns no database and uses generated Trips and Tags clients at the shell's authenticated same-origin proxy paths.

Home groups use the first ordered visit's arrival and the last visit's departure, relative to the viewer's local calendar day. Missing, invalid, or contradictory outer dates remain in Other. Trip titles use trimmed custom name, then trimmed destination, then the translated Trip label. `when` is opaque source text and never supplies route dates.

Creation is permanent: a successful POST selects the returned trip and offers no Undo. Failures and background refresh errors preserve the draft; explicit Cancel clears it. Settings save with PATCH, omit source links, and offer Undo of successful metadata edits using another PATCH. Blank optional associations and unchanged stored references do not require their catalogues to be available. Settings PATCH omits unchanged references; unavailable stored identities remain visible without claiming resolution. Explicit parent and tag selections must be valid source choices; the server remains authoritative for cycle and tag validation.

A failed refresh with cached trip data keeps the current view and editor mounted and displays a retryable error. An initial read failure renders the source error without editable fabricated data.

Query keys include the owning API origin and match the stay library for trip and visit sources. Route-context failures do not prevent trip metadata browsing or creation. Parent and shared-tag catalogue failures are independent from the trip source request.

Run the unit's discovered mise tasks for tests, typecheck, and the isolated remote build. Production serves the built assets through `Dockerfile` and nginx. The repository compose files wire the UI and the Trips API's mounted SDK credential; provisioning the registry account and host secret follows [the Trips secret runbook](../../../infra/secrets.example/trips/README.md). Neither the app build nor compose creates credentials.

## Journey sources

`/trips/:tripId/journeys/:journeyId` mounts the exported source-backed
`JourneyWorkspace` with validated owning identities. The route reads generated Trips
REST operations and does not infer mixed route placement or alternative membership.
Use journey replaces this literal source URL after selection succeeds; selection Undo
persists its own revisioned inverse before restoring the original viewed URL.
