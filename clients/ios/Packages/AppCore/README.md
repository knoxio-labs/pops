# AppCore

## The dependency direction

Every capability a feature needs from outside itself is a `protocol` declared here. The transactions feature depends on `TransactionsRepository`; it does not depend on `BFMClient`. A module under `Packages/` that can name a concrete implementation has its dependencies pointing the wrong way, and the cost lands on whoever next tries to run that feature without a live BFM.

Fakes ship beside the protocols, as a separate `AppCoreFakes` product, so a feature's tests never stub a URL protocol and a shipping target cannot link them by accident. `Auth` follows the same split with `AuthTestSupport`; `ModuleBoundaryTests` discovers every such module by name rather than listing them, so the next one is guarded on arrival.

## The composition root

`App/` is the only place a protocol is bound to a concrete type. Nothing else constructs an implementation and nothing else learns which one it got — that is what makes swapping a transport, or running a whole feature against fakes, a change in one file rather than in every screen.

## The rule is asserted, not compiled

[ModuleBoundaryTests.swift](Tests/AppCoreTests/ModuleBoundaryTests.swift) reads every package's sources and manifest and fails on a forbidden import or dependency edge. The compiler is no help here: it refuses an import that no manifest declares, but it has nothing to say about the wrong edge being added to a manifest, which is the mistake that actually happens. SwiftLint cannot express the rule either.

So the boundary holds because a test says so. Delete that test and nothing keeps it.
