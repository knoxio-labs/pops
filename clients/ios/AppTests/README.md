# AppTests

The app's test target. This is the only place in this tree where a test runs **inside an app bundle**, on a simulator, in a process carrying the app's entitlements — `PopsTests` is hosted by `Pops`, so `Bundle.main` is the app and the Security framework treats the process as the app.

Everything else is an SPM test target under `Packages/*/Tests/`, run on the host by `swift test` with no Xcode and no simulator anywhere in the picture.

## Which of the two a suite belongs in

**A suite goes here only if it needs an app bundle, an entitlement, or a booted simulator.** Everything else stays in the package that owns the code, and a suite here that would also pass under `swift test` is in the wrong place.

Three questions that decide it:

- **Does it read `Bundle.main` and mean the app?** In a `swift test` binary `Bundle.main` is the `xctest` runner, so anything asserting about `Info.plist`, the bundle identifier or a bundled resource is asserting about the wrong bundle there.
- **Does the call need an entitlement?** Keychain access groups, the Secure Enclave, the camera. A `swift test` binary carries none and gets `errSecMissingEntitlement` (-34018) rather than a wrong answer.
- **Does it need iOS itself?** Every package here declares macOS alongside iOS precisely so `swift test` can run it on a developer machine, which means an iOS-only behaviour is invisible to it.

The rule is worth holding to because the two lanes do not cost the same. `mise run test:packages` compiles for the host and finishes in seconds; `mise run test:app` builds an app, boots a simulator, installs and injects. A suite that did not have to be here is a tax on every run from then on, paid to test the same thing more slowly.

## What is here

- **`AppBundleTests`** — everything between a build setting in `project.yml` and the value the running app reads back. The per-configuration BFM base URL, whether the key survived into the built `Info.plist` at all, and the camera purpose string whose absence is a crash rather than a build failure. [`Packages/BFMClient`](../Packages/BFMClient) can only test the pure resolver underneath.
- **`DataProtectionKeychainTests`** — that the data-protection keychain is reachable from this target. It asserts the _environment_, not `KeychainTokenStore`: the point is that this is a place the gated suites in [`Packages/Auth`](../Packages/Auth) can be moved to and pass (POPS-1439), and that is a claim worth having a test behind rather than a commit message.

## Running it

```bash
mise run test:app
```

It regenerates the project, asserts the target is still hosted and still compiles under the app's own Swift 6 and warnings-as-errors settings (`mise run verify:app-test-target`), picks the newest available iPhone simulator, runs the scheme's test action, and **fails if the number of tests it executed is zero**.

That last check is the reason this target exists at all. A test lane that runs nothing and exits 0 is worse than no lane — it is a green signal for an empty set, and nobody looks at a green check. Skipped tests count towards the total the result bundle reports, so the check subtracts them: six collected and six skipped is zero executed, and it goes red.

Set `POPS_IOS_TEST_DESTINATION` to an `xcodebuild` destination specifier to aim a run at a specific simulator.
