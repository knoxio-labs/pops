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
Undo submits their inverse PATCH/order; adding a blank leg can be undone by deleting
that newly created identity. Existing source legs are not removed by this workspace.
Failed PATCH/order writes retain their draft with explicit retry/discard. Ambiguous
leg creation/removal failures require a successful canonical source reload before
another write, preventing blind POST retries. Cached source remains
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
