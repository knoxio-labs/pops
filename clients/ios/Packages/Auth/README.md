# Auth

The device's identity: a P-256 key generated inside the Secure Enclave, the access and refresh tokens the BFM issues against it, and the one operation that has to destroy both together.

Pairing is here: `BFMDevicePairingService` owns the order the key, the code exchange and the token write have to happen in, and the cleanup for each way one of them can fail. The refresh call and the authenticating transport are not.

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

## Known gap: nothing automated exercises the real hardware path

`SecureEnclaveKeyStore` and `KeychainTokenStore` — the only two implementations that will ever run in production — **are not covered by any test that runs by default**, anywhere. This is stated plainly because it is the kind of gap that a passing test suite otherwise conceals.

Neither can run where the suite runs:

- The Secure Enclave does not exist in the simulator, so `SecKeyCreateRandomKey` fails outright, and a Mac's Enclave is not reachable from an unsigned `swift test` binary.
- The data-protection keychain requires the process to carry a keychain-access-group entitlement. A `swift test` binary carries none and gets `errSecMissingEntitlement`. The app's own test target does carry one — [`clients/ios/AppTests`](../../AppTests) runs hosted by the app and asserts that the keychain answers there — so the keychain half of this gap is a move rather than a missing environment (POPS-1439).

So `SecureEnclaveHardwareTests.swift` holds suites for both, gated behind `POPS_IOS_HARDWARE_TESTS=1` and skipped otherwise. Enabling them by default would turn every run red, and the usual response to that — deleting the assertions, or catching the error — leaves a suite that passes while testing nothing.

What the default suite does cover is the protocol contract, exercised against fakes that really sign, plus the encoding contract against bytes independently verified by `node:crypto`. What it does not cover is whether the Security-framework calls in those two files are correct. That is a real gap, it is tracked in Huly rather than left as a paragraph, and it closes when the app runs against the BFM on a real phone.

To run them meanwhile: build the app to a physical device with `POPS_IOS_HARDWARE_TESTS=1` in the test scheme's environment. Both suites use their own Keychain service and application tag, so a run cannot destroy the credentials of a genuinely paired app on the same phone.

## Logging

No token, key or signature is ever logged, and nothing here should start. `DeviceTokens` renders as `DeviceTokens(redacted)` through both `description` and `debugDescription`, so an accidental `"\(tokens)"` is harmless; the error types carry `OSStatus` codes and nothing else. A test asserts both, because this is a property that decays silently.
