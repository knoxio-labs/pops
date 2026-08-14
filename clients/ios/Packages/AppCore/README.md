# AppCore

## The dependency direction

Every capability a feature needs from outside itself is a `protocol` declared here. The transactions feature depends on `TransactionsRepository`; the receipt-capture feature depends on `ReceiptCaptureRepository`; neither depends on `BFMClient`. A module under `Packages/` that can name a concrete implementation has its dependencies pointing the wrong way, and the cost lands on whoever next tries to run that feature without a live BFM.

A capability more than one feature needs also lives here, for the same reason a seam does: `CameraAuthorizing` started in `FeaturePairing` and moved once `FeatureReceiptCapture` needed the same permission decision, because "no feature imports another feature" is one of `ModuleBoundaryTests`' rules, not a suggestion.

`RepositoryError` is shared across every repository seam rather than given a per-feature copy — the failure modes a screen renders around (the pillar is down, the session is gone, the response does not match this build) do not change shape with the domain behind the call.

Fakes ship beside the protocols, as a separate `AppCoreFakes` product, so a feature's tests never stub a URL protocol and a shipping target cannot link them by accident. `Auth` follows the same split with `AuthTestSupport`; `ModuleBoundaryTests` discovers every such module by name rather than listing them, so the next one is guarded on arrival.

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
