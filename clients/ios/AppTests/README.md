# AppTests

The app's test target. This is the only place in this tree where a test runs **inside an app bundle** — `PopsTests` is hosted by `Pops`, so the tests are injected into the running app: `Bundle.main` is the app, and the Security framework treats the process as the app rather than as a test runner.

Everything else is an SPM test target under `Packages/*/Tests/`, and those already get two lanes of their own — `mise run test:packages` on the host, and `mise run test` through `xcodebuild` against the iOS SDK on a simulator.

## Which of them a suite belongs in

**A suite goes here only if it needs an app bundle or an entitlement.** Everything else stays in the package that owns the code.

Note what is _not_ on that list: needing iOS, or needing a simulator. Those used to imply the app target and no longer do — a package's suite runs on a booted simulator against the iOS SDK too. What a package's suite still cannot have is a **bundle** and the **entitlements** that come with one, because `xcodebuild test` on a `Package.swift` produces a test bundle with no host app.

Measured on the same simulator, same Xcode, one probe run in each lane:

|                               | `Bundle.main.bundleIdentifier` | `SecItemAdd` with `kSecUseDataProtectionKeychain` |
| ----------------------------- | ------------------------------ | ------------------------------------------------- |
| package lane (`Auth-Package`) | `com.apple.dt.xctest.tool`     | `-34018` `errSecMissingEntitlement`               |
| this target, hosted by `Pops` | `com.knoxiolabs.pops`          | `errSecSuccess`                                   |

Two questions decide it:

- **Does it read `Bundle.main` and mean the app?** Anywhere else `Bundle.main` is the `xctest` runner, so anything asserting about `Info.plist`, the bundle identifier or a bundled resource is asserting about the wrong bundle.
- **Does the call need an entitlement?** Keychain access groups, the Secure Enclave, the camera. An unhosted test process carries none and gets `errSecMissingEntitlement` (-34018) rather than a wrong answer.

A third case arrives on its own: code under `App/` is in no package, so a test of the composition root has nowhere else to live.

The rule is worth holding to because the lanes do not cost the same. `mise run test:packages` compiles for the host and finishes in seconds; this one builds an app, boots a simulator, installs and injects. A suite that did not have to be here is a tax on every run from then on, paid to test the same thing more slowly.

## What is here

- **`AppBundleTests`** — everything between a build setting in `project.yml` and the value the running app reads back. The per-configuration BFM base URL, whether the key survived into the built `Info.plist` at all, and the camera purpose string whose absence is a crash rather than a build failure. [`Packages/BFMClient`](../Packages/BFMClient) can only test the pure resolver underneath.
- **`DataProtectionKeychainTests`** — that the data-protection keychain is reachable from this target. It asserts the _environment_, not `KeychainTokenStore`, and it is what keeps a red `KeychainTokenStoreTests` pointing at the code rather than at the harness.
- **`KeychainTokenStoreTests`** — `KeychainTokenStore` against a real Keychain: the accessibility class the item is actually written with, whether anything it writes is synchronizable, the `SecItemUpdate`-then-`SecItemAdd` branch in `save(_:)`, and whether `wipe()` removes what its documentation says it removes. Attributes are read back out of the Keychain rather than off the source, because a downgrade there has no symptom — an item written `AfterFirstUnlock`, or written synchronizable, stores and loads exactly as well as a correct one and is only wrong on a locked phone and on somebody else's hardware.
- **`SecureEnclaveKeyStoreTests`** — `SecureEnclaveKeyStore` against a real Secure Enclave. See below, because this one used to be impossible.

## The Secure Enclave suite, and why it is no longer gated

It was gated behind `POPS_IOS_HARDWARE_TESTS=1` on a premise that has stopped being true: that a simulator has no Secure Enclave, so `SecKeyCreateRandomKey` with `kSecAttrTokenIDSecureEnclave` fails there and the suite could only ever run on a phone.

**Measured on an Apple Silicon host, it does not fail.** The simulator reaches the host Mac's Enclave. The key it returns reports `kSecAttrTokenIDSecureEnclave` as its token, and its private half refuses to export. So the gate came off and the suite runs on every CI run.

Two of its tests exist only to keep that from being a comfortable lie, because a software key generated after a silently-ignored Enclave request creates, signs, verifies, persists and deletes exactly like a real one — every other test in the suite passes against a fake:

- `privateKeyIsNonExtractable` — `SecKeyCopyExternalRepresentation` on the stored private key must fail.
- `softwareKeysAreExtractable` — the control. The same call on an ordinary P-256 key must succeed, or the refusal above is a property of the API rather than of the Enclave, and the test above is vacuous.

If a future toolchain, runner image or architecture withdraws simulator Enclave support, this suite goes **red**, loudly, rather than quietly skipping. That is the intended behaviour and the reason it is not gated: a skipped suite inside a passing run is indistinguishable from one that ran. Re-gating it would be a decision to stop testing the app's central security property, and should look like one.

What the suite proves is that the Security-framework calls in `SecureEnclaveKeyStore.swift` are correct — the access-control flags, the query shapes, the whole lifecycle. What it cannot prove is anything about one particular phone's hardware; no test can. `mise run test:device` runs the same suite on an attached iPhone, and CI never runs it because no runner has a phone.

It lives in this target rather than in `Packages/Auth` for the same reason `KeychainTokenStoreTests` does: the key is created `kSecAttrIsPermanent` in the data-protection keychain, so an unhosted package test bundle would fail on the keychain before reaching the Enclave, with a failure nobody could attribute.

## Running it

```bash
mise run test:app     # this lane alone, on the simulator
mise run test         # both simulator lanes, which is what CI invokes

POPS_IOS_DEVICE='<your iPhone>' mise run test:device   # this lane on real hardware
```

`test:app` regenerates the project, asserts the target is still hosted and still compiles under the app's own Swift 6 and warnings-as-errors settings (`mise run verify:app-test-target`), runs the scheme's test action on `POPS_IOS_SIMULATOR`, and **fails if the number of tests it executed is zero**.

That last check is the reason this target exists at all. A lane that runs nothing and exits 0 is worse than no lane — it is a green signal for an empty set, and nobody re-reads a green check. Skipped tests count towards the total the result bundle reports, so the check subtracts them: six collected and six skipped is zero executed, and it goes red.

**The simulator is a pin, not a preference.** `POPS_IOS_SIMULATOR` in `mise.toml` names one device so a local run and a CI run test the same thing, and mise's `[env]` beats the shell — exporting a different value does nothing. To run against a device this machine actually has, put the override in a gitignored `mise.local.toml`, which takes precedence over the committed file:

```toml
[env]
POPS_IOS_SIMULATOR = "iPhone Air"
```

That covers both simulator lanes at once, which a per-task destination variable would not.
