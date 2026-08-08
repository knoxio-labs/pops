# The perimeter

Everything between the public internet and the federation.

bfm's hostname has Cloudflare Access bypassed — that is what lets a native app
reach it without a browser login (POPS-1389) — so this directory is not one
layer of defence among several. It is the only one.

```
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
                                          ▼
                                      res.locals.device ─► the route
```

`device-signature.ts` sits off to one side of that diagram: it is the bytes half
of proof of possession, not part of the bearer-token path. It decodes the SPKI
public key stored at pairing and checks an ECDSA P-256 signature the phone
produced, and nothing else — the refresh route that will call it is POPS-1375,
and the message format it signs over belongs to that route rather than here.

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
covers paths no route has been written for yet. The mobile surfaces land in
later tickets (POPS-1378, POPS-1379) and none of them can arrive
accidentally public.

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

Two tiers, because the only usable client key is forgeable. The tunnel's
ingress points at `bfm-api:3014` directly, so there is no nginx hop on the
device path and the socket peer is cloudflared's bridge address — identical for
every phone. `CF-Connecting-IP` is the real client, and it is also settable by
anything on the LAN or in the compose network, which can reach `/mobile/*`
through the shell's `/bfm-api/` prefix.

- A **global** budget across the whole prefix, keyed by nothing. Forging the
  header buys an attacker at most this.
- A **per-client** budget on the resolved address, so one hostile source runs
  out long before it can spend the household's ceiling.

The global tier is charged first, and that order is load-bearing rather than
arbitrary: a request refused there never mints a per-client key, which is what
bounds a map keyed by attacker-chosen input. A value that is not a syntactically
valid IP is not taken as a key at all — otherwise every request could carry a
fresh one and the fine tier would be a no-op.

Both limits sit far above what a household of handsets generates; the constants
in `mobile-rate-limit.ts` say how far. The counters are process-local, which is
exact for one container and wrong for two — POPS-1474 tracks that, with the
trigger pinned to whichever change first adds a replica.

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

## What is not here

- **Refresh and rotation** (POPS-1375). Access tokens are deliberately short —
  the TTL constant in `access-token.ts` says why — which only works because
  something else can mint a replacement. Until that ticket lands, nothing in
  this pillar issues an access token at all: `mintAccessToken` is called by the
  pairing exchange (POPS-1374) and the refresh route, neither of which exists.
  `device-signature.ts` is the primitive that ticket verifies with; the nonce,
  the signed-message format and the rotation state machine are all its.
- **A budget on the pairing exchange** (POPS-1374). `mobile-rate-limit.ts`
  bounds the `/mobile` prefix; the pairing exchange is a separate surface and
  the more attractive target of the two, because a code short enough to read
  off a screen is short enough to guess. It should budget redemption on the
  same `rate-limit.ts` mechanism, keyed by request source, when it lands.
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
- **Anything about `lastSeenAt`** (POPS-1469). The guard is the natural place
  to write it and deliberately does not, because a write on every request is a
  decision for the ticket that adds the first real mobile route.
