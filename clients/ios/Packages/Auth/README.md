# Auth

The device's identity: a P-256 key generated inside the Secure Enclave, the access and refresh tokens the BFM issues against it, and the one operation that has to destroy both together.

Pairing, the refresh call and the authenticating transport are not here yet — this package is the storage layer they will be built on.

## The property everything else rests on

The private half of the device key is generated inside the Secure Enclave and is **non-extractable**. Not by this app, not by another app, and not by someone holding the unlocked phone with a debugger attached. That single property is why a refresh token leaked from the server, a proxy log or a backup is not a compromise: it can only be spent alongside a signature that only this specific piece of hardware can produce.

Everything in this package exists to avoid weakening it. In particular the fakes — see below — do not have it, which is why they are shipped where the app cannot reach them.

## Two products, and why

| Product           | Contains                                               | Who depends on it              |
| ----------------- | ------------------------------------------------------ | ------------------------------ |
| `Auth`            | The protocols and the two real, hardware-backed stores | The app target                 |
| `AuthTestSupport` | `InMemoryKeyStore`, `InMemoryTokenStore`               | Test targets and previews only |

`InMemoryKeyStore` really signs, so tests exercise create → sign → verify → delete rather than counting calls. What it does not do is protect anything: its private key sits in the process heap and vanishes on exit. Wiring it into the composition root by accident would produce an app that pairs, works, and provides none of the guarantees the pairing was for — a failure with no symptom.

Splitting it into its own product is what makes that mistake unavailable rather than merely discouraged: the app target links `Auth` alone, so there is no import statement that reaches the fakes. `ModuleBoundaryTests` in `AppCore` asserts it, discovering every `*Fakes` / `*TestSupport` module by name rather than from a list — this package's is the second one, and a hand-maintained list would not have grown to cover it.

## Decisions recorded in the source

Two choices here are load-bearing and are argued where they are implemented, not repeated here:

- **No biometry on the signing key** — `SecureEnclaveKeyStore.swift`. Signing needs an unlocked device and nothing more, because refresh is a background operation and a Face ID prompt on token expiry is a prompt for something the person did not do.
- **One Keychain item, not two** — `KeychainTokenStore.swift`. There is no Keychain transaction, so the way to make a partial wipe impossible is to have nothing to interleave.

## The encoding contract

The BFM verifies these signatures with `node:crypto`. CryptoKit and `node:crypto` agree on neither the ECDSA signature encoding nor the public key encoding by default, and a mismatch on either produces an ordinary `401` with nothing in either log to distinguish it from a wrong token.

The choice is pinned as a committed vector at [`clients/ios/Contracts/device-signature-v1.json`](../../Contracts/device-signature-v1.json) — a real key, a real message and a real signature — and asserted from both languages:

- Swift: `Tests/AuthTests/DeviceSignatureFixtureTests.swift`
- Node: [`scripts/ci/check-device-signature-fixture.mjs`](../../../../scripts/ci/check-device-signature-fixture.mjs), run by the `Device signature encoding (iOS ↔ BFM)` job in [`quality.yml`](../../../../.github/workflows/quality.yml), with a unit suite at [`scripts/ci/__tests__/check-device-signature-fixture.test.ts`](../../../../scripts/ci/__tests__/check-device-signature-fixture.test.ts) under the `Scripts tests` gate
- The BFM itself, against its own vendored copy of the same bytes: [`pillars/bfm/src/api/auth/device-signature.ts`](../../../../pillars/bfm/src/api/auth/device-signature.ts) is the verifier a refresh request actually meets, and its tests are the only place in the repo where `node:crypto` is shown to accept what CryptoKit produced

Both sides also assert the negative controls: the raw `r‖s` encoding of the _same_ signature must be rejected where DER is expected. Without those, "we chose DER" would be a comment rather than something a test can fail on.

`DeviceSignatureContract` in the source states the chosen encodings and the reasoning for each. The _content_ of the signed message — how a nonce and a refresh token are bound into bytes — is deliberately not fixed here; that is the BFM's to define, because the server is the party that rejects a wrong one.

Regenerate the fixture with `mise run fixture:device-signature` **from the repo root** — that task regenerates this copy and re-vendors the BFM's, and the guard fails if you do only the first half. **Only** when the encoding contract itself changes: ECDSA draws a fresh nonce per signature, so every run produces different bytes and replaces a reviewed, cross-verified vector with an unreviewed one.

## Running the tests

```bash
mise run test:packages
```

or, for this package alone:

```bash
swift test --package-path Packages/Auth
```

## The two real stores are not tested from here

`SecureEnclaveKeyStore` and `KeychainTokenStore` are the only implementations that will ever run in production, and **neither has a suite in this package**. Not an oversight — this package's tests cannot reach either type:

- The data-protection keychain requires the process to carry a keychain-access-group entitlement. A `swift test` binary has none, and neither does an unhosted `xcodebuild test` bundle; both get `errSecMissingEntitlement` (-34018).
- The Secure Enclave key is also created `kSecAttrIsPermanent`, so creating one hits the same wall as above rather than a hardware one. On an Apple Silicon host the simulator does reach the host Mac's Enclave — see below — but `SecItemAdd` fails on the missing entitlement before a package test ever gets that far.

Both suites therefore live in the app's test target, [`clients/ios/AppTests`](../../AppTests), which is hosted by the app and so runs with the app's bundle and entitlements. **Both run on every CI run**:

| Suite                        | Exercises                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `KeychainTokenStoreTests`    | accessibility class, synchronizability, the update-then-add branch, wipe scoping |
| `SecureEnclaveKeyStoreTests` | Enclave residency, non-extractability of the private half, the key lifecycle     |

The second of those was gated off for a long time on the premise that a simulator has no Enclave. That premise no longer holds on an Apple Silicon host — the simulator reaches the host Mac's Enclave — so the gate is gone, and the suite carries a positive control that makes a silent software-key fallback fail rather than pass. [`AppTests/README.md`](../../AppTests/README.md) argues the whole arrangement; the short version is that neither store is unverified any more.

What this package's own suites cover: the protocol contract, exercised against fakes that really sign; the whole-pair and partial-wipe semantics; redaction; and the encoding contract against bytes independently verified by `node:crypto`.

## Logging

No token, key or signature is ever logged, and nothing here should start. `DeviceTokens` renders as `DeviceTokens(redacted)` through both `description` and `debugDescription`, so an accidental `"\(tokens)"` is harmless; the error types carry `OSStatus` codes and nothing else. A test asserts both, because this is a property that decays silently.
