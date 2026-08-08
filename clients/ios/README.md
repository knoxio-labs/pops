# iOS client

A native SwiftUI iPhone app that reaches the federation over HTTP through one pillar and is imported by nothing in this repo — the two halves of what [ADR-043](../../docs/architecture/adr-043-clients-as-a-unit-kind.md) means by a client. It is in neither the pnpm workspace nor the cargo workspace; `pnpm`, `tsc` and `cargo` have nothing to say about this directory.

That pillar is the BFM, and it is not in the tree yet (POPS-1364) — nor is any code here that would call it. Read every mention of it below as the shape this app is being built into, not as something you can go and look at.

The consequence worth internalising before changing anything here: this app is **distributed, not deployed**. It leaves through App Store Connect onto hardware the operator does not control, so a build already on a phone keeps calling yesterday's contract for as long as its owner declines to update. Every other consumer of a pillar contract in this repo redeploys with its producer; this one cannot.

## Building it

```bash
mise run generate      # xcodegen generate — writes Pops.xcodeproj
mise run build         # xcodebuild, iOS Simulator
mise run build:device  # signed Release, physical iPhone
```

`mise run build:packages` type-checks every package with `swift build` alone, without Xcode or a simulator, and `mise run test:packages` runs every package's tests the same way. Both compile for the host, which means macOS rather than iOS — an iOS-only regression survives them, and is caught by `mise run build` instead.

`mise run verify:release-carries-no-host` builds Release and fails if the result names a BFM host — see [Where the BFM base URL comes from](#where-the-bfm-base-url-comes-from).

Requires an iOS 27 SDK. `mise install` here pins XcodeGen; Xcode itself is not managed by mise.

## Signing, and installing on a phone

Signing is automatic, and the only input it needs is an Apple Developer team.

**The team ID is not in this repo.** It is machine state, not project state, and this repo is public. `Config/Signing.xcconfig` is committed, defaults `DEVELOPMENT_TEAM` to empty and optionally includes a gitignored `Config/Signing.local.xcconfig`; `mise run generate` writes that file, pointing it at:

```
~/.config/pops/ios-signing.xcconfig      # DEVELOPMENT_TEAM = XXXXXXXXXX
```

One file per machine, picked up by every clone and every worktree, because generating is already a prerequisite of building. The local file is generate's output and nothing else's: it is rewritten on every run and deleted when the machine config is gone, so it can never outlive the team it points at. A machine without it still builds for the simulator — `#include?` tolerates a missing file — and fails a device build with `Signing for "Pops" requires a development team`.

The indirection through a generated local file is not decoration. A project-referenced xcconfig expands neither `~` nor `$(HOME)` in an include path, and an include it cannot resolve contributes nothing _without warning_, so the absolute path has to be computed outside Xcode. (A `-xcconfig` passed on the command line does expand `~`, which makes this easy to test wrong.)

No certificate, profile or key is in the tree, and none should be: automatic signing fetches them, and the first device build needs `-allowProvisioningUpdates` — which `build:device` passes — so it can register the App ID and pull down a profile.

### On the phone

1. **Enable Developer Mode** — Settings → Privacy & Security → Developer Mode. The phone restarts.
2. **Pick the destination in Xcode** — open `Pops.xcodeproj`, choose the `Pops` scheme and the phone in the destination menu, then Run. For a Release build, Product → Scheme → Edit Scheme → Run → Build Configuration → Release first; the Run action defaults to Debug, and the two configurations differ in a way that matters here.
3. **Trust the certificate if asked** — a first install of a development-signed app shows _Untrusted Developer_ on launch. Settings → General → VPN & Device Management → the developer app → Trust.
4. **It lasts a year.** A paid Apple Developer Program membership issues year-long development provisioning profiles, so the build keeps launching until the profile expires and does not need reinstalling weekly. Without the paid membership it would be seven days.

## Where the BFM base URL comes from

**Release ships no hostname.** The base URL arrives with the pairing QR alongside the pairing code, and is stored at pairing time. Two things follow: the shipped binary names no host, and pointing the app at a different deployment is a re-pair rather than a rebuild.

Debug bakes in `http://localhost:3014` so simulator work does not have to pair against a real deployment first, and honours a `POPS_BFM_BASE_URL` environment variable — set one on the scheme's Run action to aim a single run somewhere else. Release ignores the override, so a shipped app cannot be re-pointed by whoever launches it.

The value is a per-configuration build setting in `project.yml`, read through `App/Info.plist`. It needs a real `Info.plist` because Xcode honours `INFOPLIST_KEY_*` only for keys on its own allowlist and drops the rest silently — a generated plist cannot carry a custom key. `BuiltInBaseURL` in `Packages/BFMClient` resolves it, rejecting anything that is not an absolute HTTP(S) URL so an unexpanded build setting fails at launch rather than at the first request.

`mise run verify:release-carries-no-host` builds Release and greps the result for the host Debug uses, reading that host out of the Debug configuration rather than repeating it, so the check cannot drift.

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

Each package other than `AppCore` and `DesignSystem` is a shell whose placeholder type says what the module is for; `BFMClient` carries the base-URL resolver and nothing else yet. Filling them in is one ticket per module.

## Known gaps

- **Nothing consumes the resolved base URL yet.** `BuiltInBaseURL` answers where the BFM is; no transport asks it, because there is no transport (POPS-1380) and no pairing store to fall back on in Release (POPS-1383).
- **No CI job builds this.** `.github/workflows/_discover-units.yml` scans `pillars/` and `libs/` only, so nothing in the existing matrix compiles a line of Swift, and a green PR says nothing about this directory. The iOS workflow is POPS-1376.
