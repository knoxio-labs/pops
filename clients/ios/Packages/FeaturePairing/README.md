# FeaturePairing

The app's first screen when unpaired, and the only one anybody sees before anything else works: scan a QR code or type the details, name the device, pair.

## What is here and what is not

This package holds the screen and the decisions behind it. It holds no cryptography and no networking, and it names neither `Auth` nor `BFMClient` — it talks to `AppCore`'s `DevicePairingService` and does not know that the thing behind it generates a Secure Enclave key and posts to a BFM.

That boundary is asserted, not merely intended: `ModuleBoundaryTests` in `AppCore` fails if any package outside `Auth` and `BFMClient` imports either.

| Concern                                     | Lives in                                 |
| ------------------------------------------- | ---------------------------------------- |
| The screen, the form, the camera            | here                                     |
| Key generation, token storage, the exchange | `Auth` — `BFMDevicePairingService`       |
| `POST /devices/pair` and its four outcomes  | `BFMClient` — `BFMHTTPClient.pairDevice` |
| The error vocabulary both sides speak       | `AppCore` — `PairingError`               |

## The manual path is not a fallback screen

There is one screen with three fields on it, always. A scan fills the server and code fields; typing fills the same ones. That is deliberate: the camera path fails in precisely the situations where re-pairing matters — a revoked device, a permission refused months ago, a phone with the camera restricted by policy — so the alternative cannot be somewhere else to navigate to.

Camera permission is therefore a state of the scan section, never a blocker: refused, restricted and absent each replace the scan button with one sentence and leave the form untouched. Only `denied` offers a Settings link, because it is the only one Settings can change.

## The device name

`POST /devices/pair` requires `deviceName`, and it is what the operator reads when deciding which handset to revoke. Since iOS 16 `UIDevice.current.name` returns the generic model name — every device is "iPhone" — unless the app holds an entitlement Apple grants by application. So the field is editable and prefilled rather than sent silently; `deviceModel` (`iPhone17,1`) is read from the hardware alongside it and is not editable.

On a simulator the hardware identifier is the _Mac's_ (`arm64`), so `SIMULATOR_MODEL_IDENTIFIER` is preferred when it is set. See `DeviceDescription.swift`.

## What this package deliberately does not validate

The pairing code's alphabet, length and grouping are bfm's rules and appear nowhere in the OpenAPI contract. Restating them here would be a second copy that nothing gates, and the failure mode is silent: a producer that widened its alphabet would find this app rejecting codes the server would have accepted, with a disabled button as the only symptom. The code is passed through as typed and the server decides.

The one bound that _is_ enforced is the contract's own `maxLength`, because the generated client does not enforce it and an over-long field returns a 400 that reads to the user as a broken app. `PairingFieldBoundsTests` reads the vendored snapshot and fails if the constant and the contract disagree. It is measured in UTF-16 code units — see `PairingField.swift` for why that is stricter than both Swift's `String.count` and JSON Schema's own definition, and why stricter is the only safe direction.

## The host build, and the four `#if`s

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator. Keeping that working costs four platform conditionals, and they are all there is:

- `QRScannerView.swift` and `QRScannerCoordinator.swift` — whole-file. There is no honest macOS build of a phone's QR scanner, and a stub that compiled would be something a test could pass against.
- `PairingView.scannerSheet` — presents the scanner on iOS, `EmptyView` otherwise.
- `PairingFormFields.swift` — two text-entry modifiers (`keyboardType`, `textInputAutocapitalization`) that exist only on iOS.
- `FeaturePairing.swift` — `SystemSettings.url`, isolated so one conditional covers every call site.
- `DeviceDescription.swift` — `UIDevice` for the suggested name.

Everything the screen _decides_ is outside them, which is the point: which sentence a failure produces, what a scanned payload means, and when the form may be submitted are all answered in under a second by `swift test`.

## Verification gap: Dynamic Type and VoiceOver

Nothing automated exercises this screen at accessibility text sizes or under VoiceOver. What the code does about it — a `ScrollView` that is unconditional rather than conditional on overflow, text styles rather than point sizes, a label per field, an accessibility hint naming the field that is blocking submission, and a spoken announcement when a pairing fails — is all reasoning, not measurement. Tracked as a gap rather than claimed as covered.

## Running the tests

```bash
swift test --package-path Packages/FeaturePairing
```

or, against the iOS SDK on a simulator, as CI runs them:

```bash
mise run test
```
