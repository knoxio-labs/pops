# Auth

The device's identity: a P-256 key generated inside the Secure Enclave, the access and refresh tokens the BFM issues against it, and the one operation that has to destroy both together.

Pairing is here: `BFMDevicePairingService` owns the order the key, the code exchange and the token write have to happen in, and the cleanup for each way one of them can fail.

So is everything that happens after it. `AuthenticatingMiddleware` attaches the access token to every `/mobile/*` request and acts on the two ways the BFM can refuse one; `DeviceSessionRefresher` performs the challenge/sign/exchange dance behind it, at most once at a time. Both are argued below.

## Refresh, and why single-flight is not an optimisation

The BFM rotates refresh tokens and **revokes the whole token family** when a consumed one is presented again. It does that deliberately — two parties holding what should be one credential is a replay or a theft, and there is no third reading — and it cannot tell an honest handset that submitted twice from a thief racing it.

So two concurrent refreshes do not waste a round trip. They sign the user out and force a re-pairing, and they do it on exactly the occasion the app is under load: a screen that fires four requests on appear, all holding the same expired token.

`DeviceSessionRefresher` is an actor for that reason, and not a lock — a lock held across an `await` either deadlocks or is not held, and the version that is not held is the one that ships, because it passes every test written before someone thought about it. Three arrivals are handled, and the third is the one that is easy to leave out:

| Arrival       | State                                                      | What happens                            |
| ------------- | ---------------------------------------------------------- | --------------------------------------- |
| **First in**  | no refresh running, stored token is still the rejected one | starts one                              |
| **Alongside** | a refresh is running                                       | awaits it; makes no call of its own     |
| **Late**      | a refresh already finished                                 | takes the stored pair; does not refresh |

Leaving out **Late** is how a request queued behind twenty others triggers a second refresh a moment after the first succeeded — the family-burning case, reached without any two calls ever being concurrent.

`AuthenticatingMiddlewareConcurrencyTests` holds that in place with a barrier at the transport and a gate on the rotation, so the assertion is "nineteen callers were parked inside the refresher while the twentieth's rotation was in flight", not "one rotation happened". The difference matters: the weaker version passes against an implementation with no single-flight at all.

## The status codes are the contract

| Status | Means                           | This app                                                       |
| ------ | ------------------------------- | -------------------------------------------------------------- |
| `401`  | this access token is not usable | refresh once, retry once. A second `401` is **not** retried    |
| `403`  | this _device_ is not usable     | destroy the key and the tokens, drive the session to `revoked` |

There is no retry counter, because there is no loop: the retried request is sent once and its answer is returned whatever it is.

A revocation and a rotation can be in flight together, and the rotation can finish **second** — request A's refresh is accepted just before the revocation reaches the row, request B's `/mobile` call meets the guard just after. The refresh then returns a perfectly valid new pair for a device that has just been wiped. `DeviceSessionRefresher` carries a credential epoch for exactly this: a rotation that started before a wipe does not write what it obtained, because doing so would leave a token pair with no Enclave key behind it — the half-state `DeviceCredentialStore.wipe()` exists to make impossible.

The `403` path is the only one that destroys anything on a refusal. A rejected _grant_ does not wipe — re-pairing is what replaces those credentials and re-pairing wipes first, so destroying them eagerly would only add a way for a misread `401` to cost a device its identity. And a `401` or `403` whose body this build cannot decode is treated as a transport failure rather than as either refusal: Cloudflare Access answers exactly those two statuses with exactly such a page, and this BFM's device surface is one misapplied policy away from serving them to every handset at once. `BFMClient`'s `DeviceRefresh.swift` argues that asymmetry against pairing's, which does infer from a bare status.

## A middleware, not a transport

`AuthenticatingMiddleware` conforms to `OpenAPIRuntime`'s `ClientMiddleware`, and `BFMClient` exposes `init(baseURL:middlewares:)` for it. That is the seam because of what it does _not_ hand over: a middleware runs around the transport, so it can rewrite a request and send it twice, and it cannot choose the timeouts, the redirect policy or the TLS behaviour. Those stay with `BFMClient`, whose transport-injecting initialiser is still `internal`. `ModuleBoundaryTests` asserts the whole of that — this package may name `OpenAPIRuntime` and `HTTPTypes`, and may not name `OpenAPIURLSession`.

Only `/mobile/*` gets a token, by allowlist. `POST /devices/refresh` answers `401` and `403` like any other route, so a middleware that acted on those statuses everywhere could attempt a refresh from inside a refresh — the allowlist makes that unreachable rather than merely unlikely.

## The signed message

The refresh request proves possession of the Enclave key by signing bytes the BFM rebuilds and verifies:

```
BFM-REFRESH-V1\n<nonce>\n<sha256(refreshToken), lowercase hex>
```

UTF-8, exactly two `\n`, no trailing newline. `RefreshSignatureMessage` is this side of it; `refreshSignatureMessage()` in `pillars/bfm/src/api/auth/refresh-exchange.ts` is the other, and its file header is the format's only prose definition. **No compiler checks the two against each other**, and a mismatch of one byte arrives as a `401` indistinguishable from an expired token.

So a committed vector does instead — one nonce, one token, its digest and the resulting bytes, at [`clients/ios/Contracts/refresh-message-v1.json`](../../Contracts/refresh-message-v1.json). `RefreshSignatureMessageTests` reads it here; the BFM asserts the same bytes against its own construction in `pillars/bfm/src/api/auth/__tests__/refresh-message-fixture.test.ts`; and [`scripts/ci/check-refresh-message-fixture.mjs`](../../../../scripts/ci/check-refresh-message-fixture.mjs), run by the `Refresh signed-message format (BFM ↔ iOS)` job in [`quality.yml`](../../../../.github/workflows/quality.yml), fails the build if the two copies drift or if the vector stops holding the properties the format exists for — the digest rather than the token, lowercase hex, two separators, no trailing newline. That last part is what a plain equality check cannot do: it catches a format change that regenerated the vector along with it.

The direction is the reverse of the encoding vector below. The BFM authors this one, because it is the party that rejects a wrong message, and this directory holds a vendored copy. Regenerate with `mise run fixture:refresh-message` from the repo root — and change the Swift construction in the same commit, because the vector moving is not this side following.

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

`DeviceSignatureContract` in the source states the chosen encodings and the reasoning for each. The _content_ of the signed message — how a nonce and a refresh token are bound into bytes — is deliberately not fixed here; that is the BFM's to define, because the server is the party that rejects a wrong one, and it has its own vector above.

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
