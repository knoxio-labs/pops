# ADR-046: The mobile surface accepts writes, and only ingestion

## Status

Accepted — 2026-08-13. Reverses the "nothing under `/mobile` uses a verb other than `GET`" invariant recorded in `pillars/bfm/README.md`, and replaces it with a narrower one that CI enforces (POPS-1950).

## Context

bfm is the only backend the iPhone app dials. Its `/mobile/*` surface is behind `requireDevice` on an Access-bypassed hostname, and every route under it has been a `GET`: the transaction list, the transaction detail, the bootstrap payload. The pillar README stated that as a design invariant — "the mobile surface is read-only; mutations are tracked separately" — with "separately" naming nothing, since no issue tracking a mobile write surface existed anywhere.

Receipt capture (POPS-1949) is the request that makes the invariant false. `purchases` already ships the whole intelligence: `POST /receipts` takes base64 parts, reads them with a vision model, gates the reading against the total the receipt itself states, and answers `created`, `needs-review` or `unreadable`. What is missing is the path from a handset to that route, and that path is a `POST`.

The decision is not "may this one route exist". It is what the rule becomes afterwards, because the rule is what the _next_ mobile write is reviewed against — and a rule established by whichever PR happens to add the first `POST` is a rule nobody chose.

Two constraints frame the answer. The device-certificate pairing perimeter — pairing codes, refresh-token rotation, revocation — lives in bfm and nowhere else. And `purchases` authenticates callers as service accounts (ADR-044), a vocabulary that has no concept of a handset.

## Options Considered

| Option                                                                                               | Pros                                                                                                                                                                                   | Cons                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `/mobile` read-only and let the phone `POST` to `purchases` directly                            | No new verb on bfm; no proxy hop; the upload does not pay for a second round trip                                                                                                      | `purchases` would have to learn device-certificate authentication, which means the pairing perimeter exists in two pillars and every later mobile write pillar copies it a third time. It also puts a pillar with no internet-facing posture on a bypassed hostname |
| Keep `/mobile` read-only and add a separate write-only surface on its own prefix                     | The read-only sentence stays literally true                                                                                                                                            | The sentence was never the point — the gate was. A second prefix means a second perimeter mount, and the one thing `MOBILE_PATH_PREFIX` buys is that a route added under it cannot be ungated by accident                                                           |
| Open `/mobile` to writes generally, reviewed case by case                                            | No taxonomy to argue about; the review bar is the same one every PR gets                                                                                                               | "Reviewed case by case" is the bar that produced this ADR's own problem. It admits a `PUT /mobile/finance/transactions/:id` on the same footing as a receipt upload, and those are not the same risk: one edits a record the phone did not create                   |
| **Writes are admitted, restricted to ingestion, and the restriction is enforced by a test (chosen)** | Keeps one perimeter, one gate, one prefix. Draws the line where the risk actually changes — content the device captured versus records the pillar owns — and makes the line mechanical | A taxonomy to hold: "ingestion" needs a definition sharp enough for a reviewer to apply, and the enforcing test only sees verbs, so the rest of the rule still rests on review                                                                                      |

## Decision

**bfm's mobile surface gains write endpoints, narrowly scoped to ingestion.** The phone keeps talking to exactly one backend; bfm remains the single mobile perimeter.

Four constraints come with it, and all four are load-bearing.

1. **Mobile writes are ingestion-only.** The surface may accept content the device captured. It may not mutate records a pillar already holds. `PUT`, `PATCH` and `DELETE` are forbidden under `/mobile` — permanently, not pending a use case. A phone that needs to edit a transaction is asking for an operator surface, and the operator surface is behind Cloudflare Access for a reason.
2. **`POST` is permitted only where the body is device-originated content and the downstream pillar owns idempotency and dedup.** A receipt upload qualifies: the bytes came off the camera, and `purchases` content-addresses them, so the same photograph sent twice by a phone retrying on a flaky connection is one purchase and an `alreadyStored` flag. bfm therefore mints no idempotency key of its own — a second key would be a second dedup rule, disagreeing with the producer's the first time they saw the same bytes under different keys.
3. **Every mobile write is gated behind `requireDevice` AND a dedicated dotted registry scope (ADR-044).** No write inherits a read's scope. Reaching `purchases` needs `purchases.receipt` in `BFM_SERVICE_ACCOUNT_SCOPES` and a matching grant on the account, so the blast radius of bfm's credential stays readable from the repo.
4. **Body-size caps are enforced at bfm, not only downstream.** bfm rejects an oversized upload before it proxies. Relying on `purchases`' own 20mb ceiling would mean bfm buffering and forwarding a payload it was always going to be told to drop, over the fleet's internal network, for a caller on the public internet.

The verb half of constraint 1 is enforced by `src/contract/__tests__/mobile-verbs.test.ts`, which walks `bfmContract` and fails on any mobile route declaring a forbidden verb. That is ADR-045 applied to this ADR: an invariant that lives only in prose is an invariant the next PR does not know about. The rest of the rule — whether a given `POST` is genuinely ingestion — is a review judgement, and stating that plainly is better than a test that pretends to check it.

## Consequences

- The README sentence this ADR reverses is gone, replaced by the narrower invariant and a pointer here. "Tracked separately" no longer tracks nothing.
- A route added under `/mobile` with a forbidden verb fails the bfm suite, on the contract, before any handler exists to review.
- bfm's service-account grant widens for the first time since it was minted. It stays an enumerated list rather than becoming `purchases`, so the next widening is still a visible diff.
- The iOS client gains a request body it can construct wrongly. The upload route declares its own `413` and reuses the existing `400` shape, so every refusal bfm can answer is one the generated client has a case for.
- The mobile perimeter's rate limiter now bounds an expensive downstream operation, not just reads. Its budget was sized against cheap reads and is unchanged here; whether an upload should cost more than a list page is a question the first real traffic can answer (POPS-1963).
- Nothing about this ADR is specific to `purchases`. The next pillar to accept phone-captured content — a photographed document, a voice note — inherits the four constraints rather than re-deciding them.
