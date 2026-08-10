# iOS client

A native SwiftUI iPhone app that reaches the federation over HTTP through one pillar and is imported by nothing in this repo — the two halves of what [ADR-043](../../docs/architecture/adr-043-clients-as-a-unit-kind.md) means by a client. It is in neither the pnpm workspace nor the cargo workspace; `pnpm`, `tsc` and `cargo` have nothing to say about this directory.

That pillar is the BFM. Its contract is vendored here and a Swift client is generated from it — see [`Packages/BFMClient`](Packages/BFMClient/README.md). The pairing exchange is the first call the app makes through it; the authenticated ones go through `Auth`'s middleware, which attaches the device's access token and refreshes it once when the BFM says it is stale.

The consequence worth internalising before changing anything here: this app is **distributed, not deployed**. It leaves through App Store Connect onto hardware the operator does not control, so a build already on a phone keeps calling yesterday's contract for as long as its owner declines to update. Every other consumer of a pillar contract in this repo redeploys with its producer; this one cannot.

## Building it

```bash
mise run generate      # xcodegen generate — writes Pops.xcodeproj
mise run build         # xcodebuild, iOS Simulator
mise run test          # every suite, on the iOS Simulator
mise run build:device  # signed Release, physical iPhone
```

`mise run build:packages` type-checks every package with `swift build` alone, without Xcode or a simulator, and `mise run test:packages` runs every package's tests the same way. Both compile for the host, which means macOS rather than iOS — an iOS-only regression survives them, and is caught by `mise run build` and `mise run test`. Reach for the `:packages` pair as the fast inner loop; the two without the suffix are what CI runs and what a result has to be reproduced against.

`mise run test` is **one** `xcodebuild test`. Every package's test target is a testable of the `Pops` scheme alongside the app's own `PopsTests`, so the tree compiles once into one build directory and one simulator boots. The CI job invokes this one task rather than naming lanes separately, so a suite cannot exist locally and be missing from the gate.

It used to be an invocation per package, each run from inside the package's directory — a directory holding a `Package.swift` is a project as far as `xcodebuild` is concerned. That made every package a separate build tree, so a package several others depend on was compiled from scratch once per dependent: `AppCore` is a dependency of `Auth`, of `FeaturePairing` and of the app, and was compiled roughly five times per run.

What that costs is that the enumeration is no longer the loop. A package added under `Packages/` and never added to `project.yml`'s `testTargets` is a suite that never runs, in a run that stays green and gets _faster_ for it — the worst shape a regression can have. So the same claim is checked from both ends, neither of them a list written out in the task:

- every directory under `Packages/` with a `Tests/` must be named as a testable container in the generated scheme, or the task fails before building anything;
- every testable the scheme names must have reported results in the run's result bundle, or the task fails after.

On top of those, the run fails if it executed zero tests, and fails if anything skipped. That is not defensive decoration. The `Pops` scheme declared an empty test-target list until the app target existed, and a lane that runs nothing while reporting success is a green check nobody would think to question.

`mise run test:app` narrows the same scheme to `PopsTests` with `-only-testing`, for a developer changing the app target who does not want to wait on six packages' suites. CI never invokes it — it reaches that target through `mise run test`. Which of the two places a new suite belongs is decided by the rule in [AppTests/README.md](AppTests/README.md); the short version is that a suite goes in the app target only if it needs an app bundle or an entitlement.

`mise run verify:release-carries-no-host` builds Release and fails if the result names a BFM host — see [Where the BFM base URL comes from](#where-the-bfm-base-url-comes-from).

`mise run generate:bfm-client` re-vendors the BFM's OpenAPI snapshot and regenerates the Swift client from it. Run it after any change to `pillars/bfm`'s contract; CI runs the same command and fails on any diff. See [`Packages/BFMClient`](Packages/BFMClient/README.md).

`mise install` here pins XcodeGen and SwiftLint; Xcode itself is not managed by mise, so `POPS_XCODE_VERSION` in `mise.toml` is a declaration rather than something mise can install — but `mise run lint` reads and enforces it (see [Linting and formatting](#linting-and-formatting) below), so it is not CI-only the way it once was. **The deployment target is capped by that Xcode, not chosen freely.** An SDK older than the deployment target does not build and an SPM `platforms:` floor cannot be overridden from the command line, so the floor can only be the newest iOS the GitHub-hosted macOS runner can build — the latest released major, never the one a beta Xcode is previewing. Raising it is a single commit that moves `POPS_XCODE_VERSION`, `project.yml`'s `deploymentTarget` and every `platforms:` floor under `Packages/` together, and it can only happen after the runner image ships that Xcode.

## Warnings are errors

`project.yml` sets `SWIFT_TREAT_WARNINGS_AS_ERRORS` and `GCC_TREAT_WARNINGS_AS_ERRORS` at the project level, which reaches `Pops` and `PopsTests` — and stops there. SwiftPM compiles each package under `Packages/` from its own `Package.swift`, largely independent of the project consuming it, so a project-level setting says nothing about the tree nearly all of this app's logic lives in: `Pops`'s own `sources:` is one thin directory. Every manifest therefore declares a `strictSwiftSettings` list of its own, and every target it declares passes it.

The mechanism is `.treatAllWarnings(as: .error)` rather than `.unsafeFlags(["-warnings-as-errors"])`, and the choice is forced rather than stylistic: SwiftPM refuses to let a package using unsafe flags be depended on by another package, and these depend on each other by path — `Auth` on `AppCore` and `BFMClient`, each feature on `AppCore` and `DesignSystem`. Switching it on the traditional way in any one of them would break `swift build` for everything above it. That setting is also why every manifest declares `swift-tools-version: 6.2`: it does not exist below that.

One manifest per package saying the same thing is one place per package to forget it, so [Packages/AppCore/Tests/AppCoreTests/WarningsAsErrorsTests.swift](Packages/AppCore/Tests/AppCoreTests/WarningsAsErrorsTests.swift) reads all of them and fails on any whose targets do not pass the list — including a package added long after this was written.

## Linting and formatting

```bash
mise run lint     # both tools; the single command the CI job invokes
mise run format   # rewrites the sources; the fixer for the half of `lint` that has one
```

`mise run lint` is a single task rather than a documented pair of commands on purpose. The iOS CI job invokes this task and nothing else, so that there is never a second copy of the command to drift from — a hand-copied pair in a workflow file is how a green local run stops meaning anything. It runs two tools, both of them, even when the first has already failed, so one run tells you everything.

They divide the work along a line worth knowing before adding a rule to either: **`.swift-format` owns what the code looks like** and rewrites it; **`.swiftlint.yml` owns what the code may do** and rewrites nothing. A defect belongs to exactly one of them, and where both had an opinion the loser was switched off rather than left to report the same thing twice.

Both files carry their reasoning in a header comment — every limit is a number someone picked over an alternative, and the alternative is written down. That is the source of truth; this README deliberately does not repeat it, because two copies of a rule list means one of them is wrong and you cannot tell which.

Neither tool is pinned the same way. SwiftLint is a mise tool, so its version is in `mise.toml` and everyone gets the same one. `swift-format` ships inside the Xcode toolchain and cannot be pinned that way at all — which is why `POPS_XCODE_VERSION` exists and why the CI job selects that Xcode before it lints. It is also the one check whose verdict depends on which Xcode ran it, so `mise run lint` opens by comparing `xcodebuild -version` against that pin (`verify:xcode-version` in `mise.toml`) and refuses to run at all on a mismatch, naming both versions. `xcrun swift-format --version` cannot do this job — on a beta toolchain it reports the single word `main`, not something you can compare against anything — which is why the check reads the Xcode build instead, the same line CI itself parses to select the pinned Xcode. Beneath that, `mise run lint`'s rule-list drift check catches a narrower thing: an Xcode that ships a different `swift-format` rule set entirely, on the (already Xcode-version-checked) toolchain that ran it.

### Generated code

**A directory named `Generated` is a generator's output, and neither tool looks inside one.** Both rule sets describe code a person wrote, and a generated OpenAPI client breaks several of them by construction — the first person to hit that would reach for the blanket suppression comment `.swiftlint.yml` forbids.

The two exclusions are separate decisions with separate reasons, and the formatter's goes against the TypeScript side, where generated clients _are_ formatted. Both reasons are written down in [`scripts/swift-sources.sh`](scripts/swift-sources.sh), which also owns the formatter's file list, so the exclusion exists once rather than once per tool.

The name is the whole boundary, so `mise run lint` polices it in both directions: generated code outside a `Generated` directory fails, and hand-written code inside one fails too — otherwise the directory is somewhere to hide code from the linter. That the tools actually honour the exclusion is a self-test against fixtures built from the real `.swiftlint.yml`, not a claim in a comment.

One directory currently qualifies: `Packages/BFMClient/Sources/BFMClient/Generated`.

### Shebang scripts

A file whose first line is a shebang (`#!/usr/bin/env swift`) is meant to be invoked directly with `swift path/to/file.swift`, not compiled into a target — and it is excluded from `swift-format`'s file list for that reason on its own, separate from the Generated-code exclusion above. On Xcode 27 Beta 2, `swift-format format --in-place` joins that first line with a `//` comment beneath it into one line (`#!/usr/bin/env swift  //`), silently corrupting the file; `swift-format lint` does not report it, so only the write path does the damage. `scripts/swift-sources.sh` drops any such file before handing the list to either `swift-format` mode; SwiftLint is unaffected, since its file list is independent and a script's body is ordinary code to it.

One file currently qualifies: `Tools/generate-device-signature-fixture.swift`.

### Analyzer rules

```bash
mise run lint:analyze   # unused_declaration, unused_import — needs a full build
```

`swiftlint lint` above only reads source text, and `unused_declaration` and `unused_import` cannot work that way — telling whether a declaration or an import is actually used needs the compiler's own record of what got referenced, which only exists once something has built. `mise run lint:analyze` is a separate task rather than folded into `lint` for exactly that reason: `lint` stays fast and build-free, so it is still the thing people run on every save, while this one does its own clean build first and reads `unused_declaration`/`unused_import` off that. CI runs it as its own step, after `mise run build`.

The build behind it is clean every time, not reused from whatever an earlier step left behind. An incremental rebuild only logs the files it actually recompiled — one with nothing to do logs none of them, and `swiftlint analyze` reads an empty log as a clean pass rather than as a run that checked nothing. The task reads its own file count back out of `swiftlint analyze`'s summary and fails if it is lower than the number of Swift files actually under `App`, `AppTests` and `Packages` — not merely if it is zero, the same shape of guard `scripts/app-test-lane.sh` uses for executed test counts, but a floor that moves with the tree rather than a constant.

It is `build-for-testing`, not `build`, and that is what makes one `xcodebuild` enough. A plain build compiles what the scheme's build action names, which is the app target alone; the test action names `PopsTests` and every package's test target, so building for testing reaches all of them. Without that the log would cover each package's `Sources/` — the app links them — and none of its `Tests/`, even though `swiftlint lint` checks those files, and the two tools would disagree about scope in silence. The floor above is what keeps that from being a matter of trust. `Tools/generate-device-signature-fixture.swift` stays outside the floor on purpose: it is a loose script run by hand, never a member of any target a build here compiles, so no compiler log could ever cover it — `swiftlint lint` still lints it straight from source.

Both rules are configured in `.swiftlint.yml` under `analyzer_rules:`, which SwiftLint only ever runs from `analyze` — listing them there cannot make `swiftlint lint` (or `mise run lint`) slower or depend on a build.

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

Every package is written — see [Packages/Auth/README.md](Packages/Auth/README.md), [Packages/BFMClient/README.md](Packages/BFMClient/README.md), [Packages/FeaturePairing/README.md](Packages/FeaturePairing/README.md) and [Packages/FeatureTransactions/README.md](Packages/FeatureTransactions/README.md). The app's root view is not: it is still the placeholder that proves the modules link, so both screens are reachable only from `#Preview` and nothing binds a repository to the environment. That is the root shell's ticket.

## `Contracts/`

Artefacts this app and the BFM must agree on byte for byte, kept outside any one package because more than one module will assert against them and because the BFM asserts against the same bytes from TypeScript.

Three files, and the direction is not the same for all three — it follows whoever can say what the right answer is:

- `device-signature-v1.json` — the ECDSA P-256 encoding vector, asserted from Swift and from Node. **Canonical here**: only CryptoKit can produce a real signature. See [Packages/Auth/README.md](Packages/Auth/README.md#the-encoding-contract).
- `refresh-message-v1.json` — the exact bytes a refresh request is signed over. **Vendored**: the format is the BFM's to define and the BFM is the party that rejects a wrong one, so it generates the vector and this is a copy. See [Packages/Auth/README.md](Packages/Auth/README.md#the-signed-message).
- `bfm.openapi.json` — a byte-identical copy of the BFM's OpenAPI snapshot, and the input the Swift client is generated from. **Vendored.** See [Packages/BFMClient/README.md](Packages/BFMClient/README.md).

The rule underneath all three is the same: the consumer keeps a copy inside its own boundary and a CI guard fails on drift, because ADR-043 forbids a unit reading a path inside another. The BFM's copies live at [`pillars/bfm/contracts/`](../../pillars/bfm/contracts).

Regenerate either vector from the repo root, never from inside one unit — `mise run fixture:device-signature` for the first (it re-vendors as its second step; `mise run fixture:device-signature:generate` from here writes this copy alone and leaves the guard red), `mise run fixture:refresh-message` for the second. Only the first is expensive to re-run: ECDSA draws a fresh nonce per signature, so it replaces reviewed bytes with unreviewed ones. The refresh-message vector is derived from fixed inputs and rewrites itself identically.

The formatter treats the OpenAPI snapshot **oppositely** to the two vectors, and the `.openapi` infix is what separates them. `.oxfmtrc.json` and `lint-staged.config.mjs` both exclude `clients/*/Contracts/*.openapi.json`, because that snapshot's canonical copy is a pillar's build artefact and a byte-equality gate against a file the pre-commit hook rewrites fails on the first commit that touches it. The two vectors are deliberately _not_ excluded — every copy of each is a plain `*.json` at a path the same rules cover, so all of them go through one formatter and land on the same bytes. Exempting one side of either pair is what would break its gate.

## What CI does with this

`.github/workflows/ios-quality.yml` — one job, `runs-on: macos-latest`, the only workflow in the repo that is not on Ubuntu. It selects the pinned Xcode, then runs `mise run build`, `mise run test`, `mise run lint` and `mise run generate:bfm-client`, because a command written out a second time in a workflow file is a command that drifts. The one thing it spells out itself is the diff check after that last command.

Two things about it are worth knowing before you touch either side:

- **It is path-filtered to `clients/ios/**` and `pillars/bfm/openapi/**`.** The BFM contract is the input the Swift client is generated from, so a contract change has to re-run this job or the generated client rots with nothing red to show for it. That filter is what makes the regenerate-and-diff step above reachable from a change on the producer's side.
- **It is wired into `ci-gate.yml`, which is what makes it block a merge.** The gate is the one static required context in the branch ruleset; `iOS Quality` appears in both the `on.workflow_run.workflows` trigger array and the `gated` array inside the script, and either one alone is inert — trigger-only is never evaluated, gated-only never fires. A TypeScript-only PR is unaffected: this job is path-filtered out, and the gate reads an absent workflow as passing.

`mise install` is run with `MISE_DISABLE_TOOLS=rust,node,pnpm` there. mise merges config up the tree, so without it the job would download a full Rust toolchain to compile Swift.

It is not quite the only job that touches this directory. Two jobs in [`quality.yml`](../../.github/workflows/quality.yml) — `Device signature encoding (iOS ↔ BFM)` and `Refresh signed-message format (BFM ↔ iOS)` — assert the committed vectors in `Contracts/` from the Node side. They check the contracts, not the code, and would stay green through a Swift tree that does not compile. Both run on every PR rather than under this directory's path filter, because the BFM can break either contract without touching a line of Swift.

## Known gaps

- **Nothing constructs the app's dependencies yet.** `AppDependencies.unbound` is what the environment still holds. `BFMDevicePairingService`, `BFMTransactionsRepository` and both screens are written and tested, and nothing builds any of them, because the root view that would switch on the session and bind them is a placeholder (POPS-1391). Until it lands both screens are reachable only from `#Preview`.
- **Nothing automated checks Dynamic Type or VoiceOver on any screen.** The pairing screen is laid out for both and neither is measured; the reasoning and the candidate checks are in POPS-1583. See [`Packages/FeaturePairing/README.md`](Packages/FeaturePairing/README.md).
- **`mise run verify:release-carries-no-host` runs nowhere but a laptop.** The invariant it guards — a shipped binary naming no BFM host — is the one thing here that is not caught by building, testing or linting, and it is the only task in this directory that no job invokes (POPS-1475).
- **The pre-push hook does not run `mise run lint`.** It would put Xcode on the push path for every contributor, including on the TypeScript-only pushes that are almost all of them. Unformatted Swift can still reach a branch; it can no longer reach `main`, because the CI job rejects it.
- **The app has never run on a physical iPhone under test.** Both production credential stores are now covered on every CI run — `KeychainTokenStoreTests` and `SecureEnclaveKeyStoreTests` in [`AppTests`](AppTests), which is an entitled app process and, on an Apple Silicon host, reaches a real Secure Enclave. What that cannot cover is one particular phone: its Enclave, its passcode state, its provisioning. `mise run test:device` is the lane for that and nothing in CI runs it.
