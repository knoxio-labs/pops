# AppCore

## The dependency direction

Every capability a feature needs from outside itself is a `protocol` declared here. The transactions feature depends on `TransactionsRepository`; the receipt-capture feature depends on `ReceiptCaptureRepository`; neither depends on `BFMClient`. A module under `Packages/` that can name a concrete implementation has its dependencies pointing the wrong way, and the cost lands on whoever next tries to run that feature without a live BFM.

A capability more than one feature needs also lives here, for the same reason a seam does: `CameraAuthorizing` started in `FeaturePairing` and moved once `FeaturePurchases` needed the same permission decision, because "no feature imports another feature" is one of `ModuleBoundaryTests`' rules, not a suggestion. `QRScannerCoordinator` (with `QRScannerPreviewView` and `CaptureSessionHolder`) followed the same path from `FeaturePairing` once the Inventory scan screen needed the same QR capture session (POPS-4077); `FeaturePairing` keeps only the SwiftUI sheet built around it.

## Soft URIs and entity routing

`Navigation/PopsURI.swift` mirrors `libs/sdk/src/soft-uri.ts`'s `parseSoftUri`: the fleet-wide grammar `pops://<pillar>/<type>/<id>` that a printed label or a `pops://` URL encodes, parsed identically on both platforms because one prints what the other scans. `EntityRouter` is the composition root's map from a parsed `(pillar, type)` pair to whichever feature claims it — the same "only the composition root may know about more than one feature" rule `Route.swift` states for in-app navigation, so it lives here rather than in a feature. A pair nothing has registered is not an error: `EntityRouteOutcome.unsupported(pillar:)` is the approved one-line hand-off, because a label can outlive the app version that printed it, or point at a pillar this build never drew a screen for. `EntityRouterRegistry` is the plain dictionary-backed default implementation; the app target owns registering each feature's handlers into it at startup.

`RepositoryError` is shared across every repository seam rather than given a per-feature copy — the failure modes a screen renders around (the pillar is down, the session is gone, the response does not match this build) do not change shape with the domain behind the call. Conflicts retain the server's machine-readable reason so callers can distinguish a locked record from a stale compare-and-swap token without treating either as a network retry.

## Inventory protocol 2 values

`InventoryProtocol2.swift` is the phone's transport-independent vocabulary for revisioned inventory catalogues and item field values. Catalogue type, field and option ids remain stable across immutable revisions; item values carry the exact revision and field id that define them. The primitive vocabulary is closed, and decimal, date, date-time and URL values use validating wrappers so a non-canonical wire value cannot enter the replica as an ordinary `String`.

References retain their target kind and id even when the target is missing or deleted. Availability is separate from value identity: a computed value may be unavailable with its reason preserved, while an unresolved reference is still a reference. Ordered multi-values are arrays rather than sets, so duplicate values and decimal scale survive a download and relaunch.

The existing flattened item properties remain the protocol-1 compatibility surface. Protocol-2 catalogue and field values are additional fields on the same domain model so a distributed client can read either generation while rollout is in progress.

Fakes ship beside the protocols, as a separate `AppCoreFakes` product, so a feature's tests never stub a URL protocol and a shipping target cannot link them by accident. `Auth` follows the same split with `AuthTestSupport`; `ModuleBoundaryTests` discovers every such module by name rather than listing them, so the next one is guarded on arrival.

Universal search names its pillars, scopes, answer phases, chip states and recent queries in AppCore so feature packages can provide results without depending on one another. A `SearchProvider` streams ordered results or a specific availability failure and must stop promptly when its consumer is cancelled; on-device providers may publish later changes through the same stream.

`SearchPillarModel` owns one provider's debounce, generation guard and retry state. It retains earlier rows while a refinement is pending, caps them only in the All scope, and records network or download availability separately from ordinary request failure. `ScriptedSearchProvider` gives feature tests queued event streams and observable cancellation without a transport stub.

`NetworkReachability` is the process-wide network-path seam used by both replica drains and network-backed search. Its live implementation wraps `NWPathMonitor`; its scripted fake publishes the current value first to every independent stream and removes a listener when that stream terminates.

The in-memory transaction and purchase repositories page through opaque cursors they minted themselves, reject caller-derived and stale cursors, count calls, and can fail a chosen call. Replacing their rows invalidates every outstanding cursor so a refresh starts from the first page. Purchase cursor identities are never recycled, including when two filters end at the same offset.

`PurchasesRepository` accepts `PurchaseStatusFilter.all` or `.unsettled`; the latter mirrors the mobile wire's single status filter without exposing generated types. `PurchasePage.totalCount` is optional because the BFM supplies it only on a first page. Callers retain that first value while later pages carry `nil`. The in-memory repository filters before applying its cursor and binds every cursor to the filter that minted it. Updates carry a complete desired line set and an opaque compare-and-swap token; omitted header values preserve their current values in the fake. Retained lines also preserve their Inventory-link flag, while newly added lines begin unlinked.

`PurchasesMonthSummary` keeps gross and net amounts grouped by currency, carries an optional previous-month comparison, and represents merchant leaders as aggregates rather than fabricated purchases. The purchase fake accepts a seeded summary and applies the same numbered failure schedule to page and summary calls.

`PurchaseEdit` retains the server's ordered field history, including field names introduced after the app shipped. `PurchaseUpdate` carries the complete desired line set and the detail's verbatim update token so the repository can reject stale edits without the app normalising its spelling or precision.

Purchase details keep their ordered receipt URI list separate from the list row's compatibility URI. Receipt reads return decoded bytes with the server media type. The purchase fake seeds details and receipt bytes independently; page, summary, detail, thumbnail, and full-image calls all increment the same one-based call counter before applying scheduled failures.

## The composition root

`App/` is the only place a protocol is bound to a concrete type. Nothing else constructs an implementation and nothing else learns which one it got — that is what makes swapping a transport, or running a whole feature against fakes, a change in one file rather than in every screen.

## The shell

`AppShellModel` is the root's whole decision surface, and it lives here rather than in `App/` for the reason every view model does: a decision expressed as a value is a test, and a decision expressed as a view hierarchy is something someone relaunches a simulator to check. `RootDestination` is what the root view switches on — `launching`, `pairing(RevocationReason?)`, `content(FeatureSurface)` — and the view maps each case to a screen and decides nothing else.

Three inputs meet there:

- **The session.** `SessionStore` is what `Auth` drives from whatever executor a `403` arrived on, through `SessionEventSink`. The shell holds it rather than mirroring it, because a second copy of that state is a second thing that can be wrong.
- **What the device left behind.** `SessionRestoring` is read once, at launch, before anything is drawn. A device with stored credentials therefore never sees the pairing screen — not even for the frame it takes to read them, which is what `launching` exists for.
- **What the BFM says is reachable.** `BootstrapService` is `GET /mobile/bootstrap`, and it is the reason the phone carries no idea of what the federation contains. What the app _can draw_ is compiled in and is a different list: the shell takes it as `renderableFeatures` from the composition root, and offers the intersection, in the server's order.

Bootstrap does not gate the launch. The surface starts as everything this build can draw and is narrowed when the answer lands; a call that fails leaves it as it is and flags the phase as degraded. Blocking on it would mean the app does not open until a status call completes, and a status call that never completes is bounded only by a URL session timeout.

`MobileFeature`, `FeatureReachability` and `RegistrySource` are `RawRepresentable` wrappers rather than enums, for the reason `TransactionType` is one: this app is distributed rather than deployed, so a build already on a phone meets a BFM that has learned new words. An unrecognised reachability counts as usable and an unrecognised registry source counts as not current — the asymmetry is deliberate, because being unsure how fresh an answer is costs a line of explanation, while being unsure whether a screen works costs the screen.

## The rule is asserted, not compiled

[ModuleBoundaryTests.swift](Tests/AppCoreTests/ModuleBoundaryTests.swift) reads every package's sources and manifest and fails on a forbidden import or dependency edge. The compiler is no help here: it refuses an import that no manifest declares, but it has nothing to say about the wrong edge being added to a manifest, which is the mistake that actually happens. SwiftLint cannot express the rule either.

So the boundary holds because a test says so. Delete that test and nothing keeps it.
