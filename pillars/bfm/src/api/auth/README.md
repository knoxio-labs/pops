# The perimeter

Everything between the public internet and the federation.

bfm's hostname has Cloudflare Access bypassed — that is what lets a native app
reach it without a browser login (POPS-1389) — so this directory is not one
layer of defence among several. It is the only one.

A phone passes through here three times: once to become a device, on every
request it makes as one, and every ten minutes to renew the credential that
lets it keep making them.

```
an unpaired phone                     bfm
─────────────────                     ───
  POST /devices/pair ─────────────►   pairing-rate-limit.ts
    { code, publicKey, … }                │ route budget spent?        yes ─► 429
                                          │ this client's spent?       yes ─► 429
                                          ▼
                                      pairing-exchange.ts
                                          │ key parses as P-256?       no  ─► 400
                                          │ code known + live + unspent?
                                          │                            no  ─► 403
                                          ▼
                                      one transaction: spend, insert, insert
                                          ▼
                                      { deviceId, accessToken, refreshToken }

a paired phone                        bfm
──────────────                        ───
                     mint  ─────────► access-token.ts   ◄── signing-key.ts
  Authorization:                          HS256, 10 min      KeyObject, never a string
  Bearer <jwt>   ─────────────────►   mobile-rate-limit.ts
                                          │ prefix budget spent?       yes ─► 429
                                          │ this client's spent?       yes ─► 429
                                          ▼
                                      (POST /mobile/purchases/receipts only)
                                      receipt-rate-limit.ts
                                          │ route budget spent?        yes ─► 429
                                          │ this client's spent?       yes ─► 429
                                          ▼
                                      require-device.ts
                                          │ token intact and current?  no ─► 401
                                          │ device row still trusted?  no ─► 403 device_revoked
                                          │ lastSeenAt stale?         yes ─► touched
                                          ▼
                                      require-capability.ts
                                          │ path a mobile route?       no ─► 404 (the router's)
                                          │ route declares one?        no ─► 500 (a fault)
                                          │ grant holds it?            no ─► 403 capability_not_granted
                                          ▼
                                      res.locals.device ─► the route

a phone whose ten minutes lapsed     bfm
────────────────────────────────     ───
  POST /devices/challenge ────────►   refresh-rate-limit.ts ──► refresh-challenge.ts
                                          │                         nonce, 60s, single use
                                      ◄───┘
  POST /devices/refresh ──────────►   refresh-rate-limit.ts   (the SAME budget)
    { refreshToken, nonce,                │ either tier spent?       yes ─► 429
      signature }                         ▼
                                      refresh-exchange.ts
                                          │ nonce live + unspent?     no ─► 401 challenge_expired
                                          │ token known?              no ─► 401 invalid_grant
                                          │ device still trusted?     no ─► 403 device_revoked
                                          │ token already spent?     YES ─► burn the family,
                                          │                                 401 invalid_grant
                                          │ token expired?            no ─┐
                                          │ signature over            no ─┴► 401 invalid_grant
                                          │   DOMAIN\n nonce \n sha256(token)?
                                          ▼
                                      insert successor, consume predecessor
                                          ▼
                                      { accessToken, refreshToken }
```

All four budgets are the same mechanism with different numbers —
`api/tiered-rate-limit.ts`, one directory up, because it is not specific to
authentication. They keep separate counters: sharing one would let ordinary
phone traffic lock a handset out of pairing, or a handset failing to refresh
stop a different one from pairing, or a slow morning of receipts lock a
handset out of its own transaction list. The two refresh routes deliberately
share ONE, because they are two halves of a single exchange and separate
budgets would be one budget spendable twice by alternating paths.

`device-signature.ts` is the bytes half of proof of possession, used by two
paths for two different halves of itself. Pairing uses only the key parsing —
rejecting anything that is not P-256 before a row is written. Refresh uses the
verification, and **defines the message those bytes cover**; that format lives
in `refresh-exchange.ts`'s header, which is the only prose description of it
anywhere and the one `clients/ios` has to reproduce.

Its tests are the only place in this repo where `node:crypto` is shown to accept
what CryptoKit actually emits. Everything else about refresh can be exercised
with keys this process generated itself, which agree with the verifier by
construction and prove nothing about a real handset. They read the vector
vendored at `pillars/bfm/contracts/device-signature-v1.json`, never the
canonical copy under `clients/` — see the pillar README.

Neither half of that pair is prose either. Two committed vectors sit under
`contracts/`, pointing opposite ways, and a CI guard fails on drift in each:

| Vector                     | Pins                                     | Authored by               | Asserted here in                            |
| -------------------------- | ---------------------------------------- | ------------------------- | ------------------------------------------- |
| `device-signature-v1.json` | the ECDSA P-256 encodings                | `clients/ios` (CryptoKit) | `__tests__/device-signature.test.ts`        |
| `refresh-message-v1.json`  | the bytes those encodings are applied to | this pillar               | `__tests__/refresh-message-fixture.test.ts` |

The second exists because a format change is otherwise invisible: the signature
simply stops verifying, and the handset is told `401` — the same answer an
expired token gets. Regenerate it with `mise run fixture:refresh-message` from
the repo root, and change the Swift construction in the same commit; the vector
moving is not the client following.

## Why 401 and 403 are different answers

They ask the phone to do different things, and it cannot guess which.

- **401** — the token is missing, expired, tampered with, or signed by another
  deployment. The handset still holds a refresh token, so the recovery is to
  mint a new access token and retry.
- **403 `device_revoked`** — the signature is ours and current, but an operator
  revoked the device. No amount of refreshing helps; the app returns to pairing
  and wipes its keychain.
- **403 `capability_not_granted`** — the credential is entirely good and this
  device's grant does not cover this route
  ([ADR-048](../../../../../docs/architecture/adr-048-mobile-capability-scopes.md)).
  Neither recovery applies: refreshing changes nothing, and wiping the keychain
  would destroy a working pairing over a screen the device was never entitled
  to open. The app stops offering the feature.

The two 403s share a status because they are the same HTTP fact, and share
nothing else — which is why the body is a union discriminated on `code` rather
than one shape with an optional field. `clients/ios` currently folds every 403
into "end the session", which is right for the first and wrong for the second
(POPS-2459).

`clients/ios` already switches on exactly this split — `SessionReducer` maps a
403 to `.revoked(.revokedByOperator)` and nothing else does. Collapsing the two
statuses would turn its recovery path into guesswork.

An **absent** device row is a 401, not a 403. Revocation is a soft delete, so a
missing row cannot mean "revoked" — it means something else entirely (a
database restored from before the pairing, a token minted against a different
deployment). Sending the phone through refresh gets it a truthful
`credentialsRejected` rather than a revocation that never happened.

## Why the guard mounts on a prefix

`app.ts` mounts it as `app.use('/mobile', …)` rather than per route, so it
covers paths no route has been written for yet — including the mobile surfaces
still to land. None of them can arrive accidentally public. `require-capability.ts`
mounts on the same prefix immediately behind it, for the same reason and with
one addition: a mobile route that declares no capability is answered as a fault
rather than served, so "added ungated" is not a state a request can pass
through even before the contract guard catches it.

The cost is that an unrouted `/mobile/*` answers 401 rather than 404. That is
the right trade twice over: it fails closed, and it declines to tell an
unauthenticated scanner which routes are real.

## Why the budget is charged before the guard

`requireDevice` fails cheap — a signature check, and past it one indexed
lookup. Cheap per request is not the same as bounded in aggregate, and nothing
else stands in front of this hostname. So `mobile-rate-limit.ts` mounts on the
same prefix and runs first: an over-budget caller costs a map lookup instead of
an HMAC. It is charged on every `/mobile/*` request, authenticated or not,
because it sits ahead of the point where those become distinguishable.

The two-tier shape it uses, and why the coarse tier is charged first, is
`api/tiered-rate-limit.ts`. The numbers are in `mobile-rate-limit.ts`, and they
sit far above what a household of handsets generates.

`pairing-rate-limit.ts` is the same mechanism in front of `POST /devices/pair`,
mounted the same way and for a related but distinct reason: there the
credential is a code a human can type, so the budget bounds **guesses** rather
than work. Its window is one pairing-code lifetime, so a client that spends its
budget waits only as long as the code it was failing against would have lived.

`receipt-rate-limit.ts` sits in front of `POST /mobile/purchases/receipts`
only, mounted the same way and ahead of `require-device.ts` for the same
reason, but bounding a third thing: neither a signature check nor a guess, but
a Claude vision call in `purchases` that this pillar's own budget cannot see
or throttle once the request has left it. The general prefix budget was sized
against a page of transaction rows; the receipt route costs something the
mobile perimeter was never sized to protect against, so it gets a tighter
budget of its own rather than a share of the wider one (POPS-1989).

The counters are process-local, which is exact for one container and wrong for
two — POPS-1474 tracks that, with the trigger pinned to whichever change first
adds a replica.

## What is never logged

The token, in whole or in part — not in an error message, not in a rejection
log. `verifyAccessToken` forwards the library's reason (`jwt expired`, `invalid
signature`) and never the input.

A 401 is logged **nothing at all**. Anyone who can reach the hostname can
provoke one, so logging them hands an internet-facing pillar a log-flooding
primitive. A 429 is logged nothing either, for the same reason and more
sharply: it is the response a caller sees _because_ it is sending too much.
A 403 is logged, with the device id: it requires a signature this pillar
produced, which makes it a revoked handset still calling — the exact event an
operator wants after reporting a phone stolen. A device id is an identifier,
not a credential.

## Why reuse detection runs before the signature check

It is the one ordering in this directory that looks wrong and is not.

An unauthenticated caller can revoke a whole token family by presenting a
spent token with garbage in the `signature` field. That reads like a denial of
service, and it is the correct behaviour. Reaching the check needs a token this
server issued, and a refresh token is 256 CSPRNG bits — it cannot be guessed,
so presenting one **is** the evidence. Verifying the signature first would mean
a thief who stole the token but not the phone never trips the detector, and the
family they stole from stays alive. That is the compromise the whole mechanism
exists to end.

The cost lands on the honest client too, and it is worth stating plainly: a
handset that submits the same refresh twice — a lost response and a naive
retry, or two requests in flight at once — burns its own family and has to be
paired again. That is inherent to rotation with reuse detection, not a bug in
this implementation: nothing here can tell that case apart from a theft. The
app's single-flight logic is what keeps a real phone out of it, and re-pairing
is a QR scan rather than data loss.

## Why the lastSeenAt write is coalesced

`require-device.ts` moves `devices.lastSeenAt` forward on every request that
gets past both checks above, not just on `/mobile/bootstrap` — a device that
only ever calls, say, `/mobile/finance/transactions` used to read as "not seen
since pairing" forever, which is the defect POPS-1469 tracked.

The write is coalesced to once a minute (`LAST_SEEN_COALESCE_WINDOW_MS`)
rather than run on every request, because every request is exactly what passes
through here: an uncoalesced write would turn this perimeter into a write path
on a Litestream-replicated database at the pace of a phone scrolling a list.
A 403 does not count as contact — the write sits after the revocation check,
so a rejected handset never moves the column a stolen phone's operator is
about to read.

`/mobile/bootstrap` still writes its own uncoalesced instant on top of this
(`api/mobile/bootstrap.ts`), because its response contract promises the exact
value it wrote, not a value that might be up to a minute stale. That is one
extra write, at most once a minute, on the one route a launching app always
calls first — negligible next to what coalescing saves everywhere else.

## What is not here

- **A visible incident trail for a burned family.** Reuse detection writes
  `revokedAt` across the family and logs one warning with the device and family
  ids. It does not touch `devices.revokedAt`, so the Devices page still shows
  the handset as trusted while its refresh chain is dead, and the operator's
  first signal is a phone that asks to be paired again. It also leaves the
  device's current access token working for up to its remaining ten minutes.
  POPS-1536 tracks surfacing the event and deciding what, if anything, should
  happen to the live access token.
- **A shared nonce store.** `refresh-challenge.ts` keeps challenges in a
  per-process map, which is exact for one container and breaks refresh outright
  for two — a nonce minted by one replica cannot be spent at the other.
  POPS-1537, with the same trigger as POPS-1474 below.
- **App Attest binding** (POPS-1394). Pairing trusts that whoever holds the code
  is the phone the operator meant to pair. Attestation would additionally prove
  the request came from a genuine build of this app on genuine hardware. It is
  deferred rather than forgotten: the code is single-use, short-lived and
  operator-minted, which bounds the window in which an impostor could beat the
  real handset to it.
- **A per-device tier** (POPS-1495). The tiers here key on network address
  because they run before the guard and no device identity exists yet at that
  point. One keyed on `res.locals.device` would be a different limit answering
  a different question.
- **Key rotation with an overlap window.** One key signs and verifies. Rotating
  the secret invalidates every live access token, which costs each handset one
  refresh round-trip and nothing else, because refresh tokens are opaque
  database rows rather than JWTs. A second verification key would buy a
  seamless rotation nobody needs and double the surface an attacker can forge
  against.
