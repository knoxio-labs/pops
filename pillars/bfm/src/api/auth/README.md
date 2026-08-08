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
  Bearer <jwt>   ─────────────────►   require-device.ts
                                          │ token intact and current?  no ─► 401
                                          │ device row still trusted?  no ─► 403
                                          ▼
                                      res.locals.device ─► the route
```

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

## What is never logged

The token, in whole or in part — not in an error message, not in a rejection
log. `verifyAccessToken` forwards the library's reason (`jwt expired`, `invalid
signature`) and never the input.

A 401 is logged **nothing at all**. Anyone who can reach the hostname can
provoke one, so logging them hands an internet-facing pillar a log-flooding
primitive. A 403 is logged, with the device id: it requires a signature this
pillar produced, which makes it a revoked handset still calling — the exact
event an operator wants after reporting a phone stolen. A device id is an
identifier, not a credential.

## What is not here

- **Refresh and rotation** (POPS-1375). Access tokens are deliberately short —
  the TTL constant in `access-token.ts` says why — which only works because
  something else can mint a replacement. Until that ticket lands, nothing in
  this pillar issues an access token at all: `mintAccessToken` is called by the
  pairing exchange (POPS-1374) and the refresh route, neither of which exists.
- **Rate limiting** (POPS-1468). The guard is cheap to fail — a signature check
  and, past it, one indexed lookup — but nothing bounds how often an
  unauthenticated caller may try.
- **Key rotation with an overlap window.** One key signs and verifies. Rotating
  the secret invalidates every live access token, which costs each handset one
  refresh round-trip and nothing else, because refresh tokens are opaque
  database rows rather than JWTs. A second verification key would buy a
  seamless rotation nobody needs and double the surface an attacker can forge
  against.
- **Anything about `lastSeenAt`** (POPS-1469). The guard is the natural place
  to write it and deliberately does not, because a write on every request is a
  decision for the ticket that adds the first real mobile route.
