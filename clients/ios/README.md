# iOS client

A native SwiftUI iPhone app that reaches the federation over HTTP through one pillar and is imported by nothing in this repo — the two halves of what [ADR-043](../../docs/architecture/adr-043-clients-as-a-unit-kind.md) means by a client. It is in neither the pnpm workspace nor the cargo workspace; `pnpm`, `tsc` and `cargo` have nothing to say about this directory.

That pillar is the BFM, and it is not in the tree yet (POPS-1364) — nor is any code here that would call it. Read every mention of it below as the shape this app is being built into, not as something you can go and look at.

The consequence worth internalising before changing anything here: this app is **distributed, not deployed**. It leaves through App Store Connect onto hardware the operator does not control, so a build already on a phone keeps calling yesterday's contract for as long as its owner declines to update. Every other consumer of a pillar contract in this repo redeploys with its producer; this one cannot.

## Building it

```bash
mise run generate   # xcodegen generate — writes Pops.xcodeproj
mise run build      # xcodebuild, iOS Simulator
```

`mise run build:packages` type-checks every package with `swift build` alone, without Xcode or a simulator, and `mise run test:packages` runs every package's tests the same way. Both compile for the host, which means macOS rather than iOS — an iOS-only regression survives them, and is caught by `mise run build` instead.

Requires an iOS 27 SDK. `mise install` here pins XcodeGen; Xcode itself is not managed by mise.

## `Pops.xcodeproj` is generated, and gitignored

`project.yml` is the source of truth for the project; the `.xcodeproj` is output. A committed `.xcodeproj` is a large generated-looking XML blob that conflicts on every branch touching it and that no tool — including a coding agent — edits reliably.

The alternative considered was Xcode 16+ synchronized file groups, which make a folder's contents implicit and so remove the add-a-file churn from `project.pbxproj`. They reduce the conflict surface but do not remove it: build settings, target membership, package references and scheme changes still rewrite the file, and it would still be committed. Declaring the whole project once and regenerating is the version of that idea with no XML left over.

Two consequences follow, and both bite:

- **Adding or removing a source file means regenerating.** Sources are explicit file references in the generated project, so a new `.swift` file is invisible to `xcodebuild` until `xcodegen generate` runs again — it does not fail, it silently does not compile the file.
- **Xcode settings changed through the GUI do not survive.** Change `project.yml` instead; anything else is erased on the next generate.

## Module boundaries

`App/` is the entry point and the composition root, and the only place that knows every module exists. Everything else is a local SPM package under `Packages/`, one per concern.

The dependency direction is one-way:

- A feature depends on `AppCore` and `DesignSystem`. It may **not** name a concrete implementation of anything — it reads a protocol from `AppCore`, and only `App/` knows what implements it. See [Packages/AppCore/README.md](Packages/AppCore/README.md).
- Concrete implementations live in the package that owns the mechanism: `Auth` for pairing, key material and the authenticating transport; `BFMClient` for the generated types and the calls that carry them. Both depend on `AppCore`; `App/` binds them.
- **Nothing depends on a feature.** A `Feature*` module importing another `Feature*` module is the failure this layout exists to prevent — it is what turns a set of screens back into one screen-shaped monolith.

Half of that is compiler-enforced — a package can only `import` what its own `Package.swift` declares. The other half, a wrong edge being added to a `Package.swift` in the first place, is asserted by a test in `AppCore` rather than by any tool.

`Packages/DesignSystem` carries a second constraint on every feature, orthogonal to the import graph: a feature may not name a colour, a type size or a gap. See [Packages/DesignSystem/README.md](Packages/DesignSystem/README.md).

Each package other than `AppCore` and `DesignSystem` is a shell whose placeholder type says what the module is for. Filling them in is one ticket per module.

## Known gaps

- **The simulator is the only supported destination.** Signing, a real bundle identifier and a per-configuration BFM base URL are POPS-1392; until then the app builds unsigned and does not run on a device.
- **No CI job builds this.** `.github/workflows/_discover-units.yml` scans `pillars/` and `libs/` only, so nothing in the existing matrix compiles a line of Swift, and a green PR says nothing about this directory. The iOS workflow is POPS-1376.
