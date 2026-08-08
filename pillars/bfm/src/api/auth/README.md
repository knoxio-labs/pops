# The perimeter

Everything between the public internet and the federation.

bfm's hostname has Cloudflare Access bypassed — that is what lets a native app
reach it without a browser login (POPS-1389) — so this directory is not one
layer of defence among several. It is the only one.

A phone passes through here twice: once to become a device, and thereafter on
every request it makes as one.

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
                                      require-device.ts
                                          │ token intact and current?  no ─► 401
                                          │ device row still trusted?  no ─► 403
                                          │ lastSeenAt stale?         yes ─► touched
                                          ▼
                                      res.locals.device ─► the route
```

Both budgets are the same mechanism with different numbers —
`api/tiered-rate-limit.ts`, one directory up, because it is not specific to
authentication. They keep separate counters: sharing one would let ordinary
phone traffic lock a handset out of pairing.

`device-signature.ts` sits off to one side of both paths. It is the bytes half
of proof of possession: it decodes an SPKI public key and checks an ECDSA P-256
signature the phone produced. The pairing exchange uses only the first half of
that — parsing the key it is about to store, and rejecting anything that is not
P-256 before a row is written. The signature half has no caller until refresh
(POPS-1375), and the message format it signs over belongs to that route rather
than here.

Its tests are the only place in this repo where `node:crypto` is shown to accept
what CryptoKit actually emits. Everything else about refresh can be exercised
with keys this process generated itself, which agree with the verifier by
construction and prove nothing about a real handset. They read the vector
vendored at `pillars/bfm/contracts/device-signature-v1.json`, never the
canonical copy under `clients/` — see the pillar README.

## Why 401 and 403 are different answers

They ask the phone to do different things, and it cannot guess which.

- **401** — the token is missing, expired, tampered with, or signed by another
  deployment. The handset still holds a refresh token, so the recovery is to
  mint a new access token and retry.
- **403** — the signature is ours and current, but an operator revoked the
  device. No amount of refreshing helps; the app returns to pairing and wipes
  its keychain.

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
still to land. None of them can arrive accidentally public.

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

- **Refresh and rotation** (POPS-1375). Access tokens are deliberately short —
  the TTL constant in `access-token.ts` says why — which only works because
  something else can mint a replacement. `mintAccessToken` has one caller,
  `pairing-exchange.ts`, so a handset that lets its ten minutes lapse has to
  pair again until that ticket lands. It also writes the head of a refresh-token
  family that nothing yet rotates. `device-signature.ts` is the primitive that
  ticket verifies with; the nonce, the signed-message format and the rotation
  state machine are all its.
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
