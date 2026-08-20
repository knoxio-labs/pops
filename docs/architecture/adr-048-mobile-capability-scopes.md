# ADR-048: The mobile surface is gated by device capability, not by HTTP verb

## Status

Accepted — 2026-08-20. Supersedes [ADR-046](adr-046-mobile-write-surface-is-ingestion-only.md), whose constraint 1 forbade `PUT`, `PATCH` and `DELETE` under `/mobile` "permanently, not pending a use case". Three of ADR-046's four constraints survive unchanged and are restated here so this document stands alone.

## Context

ADR-046 admitted the first mobile write — a photographed receipt handed to `purchases` — and then drew a line around it: the surface may accept content the device captured, and may never mutate a record a pillar already holds. The line was drawn with HTTP verbs because verbs are mechanical, and a `src/contract/__tests__/mobile-verbs.test.ts` walked the contract to enforce it.

The reasoning behind that line is still correct. Its own options table rejected "open `/mobile` to writes generally, reviewed case by case" because it "admits a `PUT /mobile/finance/transactions/:id` on the same footing as a receipt upload, and those are not the same risk". They are not the same risk. That is the part worth keeping.

The remedy was wrong, and the word "permanently" was the most wrong part of it. The real gap in 2026-08 was that `/mobile` had no per-capability authorisation model at all: a paired device presented one bearer token naming one device row, and the surface had no way to distinguish "may upload a receipt" from "may rewrite a financial record". Banning three verbs was a stand-in for granularity that did not exist. It reads as a principle and behaves as a workaround, and workarounds should not be written down as permanent.

Two things have made the cost of that visible.

**The phone is not the untrusted client the ban implies.** It is arguably the best-authenticated caller in the fleet: a P-256 key generated in the Secure Enclave and non-extractable, a pinned DER/SPKI encoding, an operator-issued pairing code spent exactly once, refresh-token rotation with reuse detection, and revocation that lands on the very next request. The operator surface it is held below is a browser session behind Cloudflare Access. Treating the handset as read-mostly while the browser may do anything inverts the actual trust ordering.

**Whole classes of work are better on a phone, and the verb ban blocks all of them at once.** Marking a film watched and pushing it to Radarr. Creating and editing a recipe with your hands in the sink. Adding an inventory item where the item physically is. Correcting an extraction at the moment you notice the receipt says something else (POPS-2454, POPS-2455, POPS-2458). Each of those would need its own amendment to ADR-046 as written, which is the signal that the constraint sits at the wrong level.

The constraint that actually matters is not _mutating vs ingesting_. It is _destructive vs not_, and _administrative vs user-facing_.

## Options Considered

| Option                                                                                 | Pros                                                                                                                                                                                         | Cons                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep ADR-046 and amend it per use case                                                 | No new machinery; each widening gets its own review                                                                                                                                          | An invariant amended on demand is not an invariant. It also keeps answering the authorisation question with a verb, so the fifth amendment is no better informed than the first, and the rule the next PR is reviewed against is whichever amendment it happens to find      |
| Drop the ban and review mobile writes case by case                                     | Unblocks everything immediately; no taxonomy to hold                                                                                                                                         | This is the option ADR-046 rejected, and its objection stands: a receipt upload and a transaction rewrite would arrive on the same footing, gated by the same token, distinguished only by whoever read the diff                                                             |
| Gate on the pillar behind the route (`purchases` writable, `finance` not)              | Coarse but cheap; one flag per pillar                                                                                                                                                        | The granularity is wrong in both directions. `purchases` holds a receipt upload and an order deletion; `media` holds a watched-marker and a library purge. A per-pillar switch cannot express either split, so it either forbids the useful half or admits the dangerous one |
| **A device grant enumerates capabilities; each `/mobile` route declares one (chosen)** | Answers the authorisation question at the granularity the risk actually varies at. Holding one capability implies nothing about any other, so a widening is one enumerated value in one diff | A vocabulary to maintain, and a second axis beside ADR-044's service-account scopes — a call now has to be permitted at both. That second check is the point rather than a cost, but it does mean two places to look when something is refused                               |

## Decision

**A mobile route is reachable when the calling device's grant holds the capability that route declares. The HTTP verb is not part of the decision.**

Five constraints. The first two are new; the last three are ADR-046's, carried forward unchanged.

1. **A device grant enumerates capabilities, and holding one implies nothing about any other.** A capability is a dotted name for one thing a handset may do — `finance.transactions.read`, `purchases.receipts.write`, `purchases.read`. `purchases.receipts.write` does not imply `purchases.read`, and neither implies anything under `media`. The grant is a property of the device row, so revoking one capability from one handset does not touch another handset or another capability.

2. **Every `/mobile` route declares the capability it requires, on the contract.** The declaration lives in the ts-rest route's `metadata` beside the path it guards, so a route and its gate cannot be added in separate commits. `src/contract/__tests__/mobile-capabilities.test.ts` walks the contract and fails when a mobile route declares none, when it declares one outside the vocabulary, or when the walk stops finding routes at all (ADR-045). At runtime `requireCapability` refuses a request whose route the calling grant does not cover, with a `403` naming the capability — and a mobile route that reaches the middleware declaring nothing is a fault, answered as one, never as a pass.

3. **Every mobile route sits behind `requireDevice`, on the `/mobile` prefix mount.** Unchanged from ADR-046. The prefix mount is what gates routes that do not exist yet; `requireCapability` mounts on the same prefix, immediately behind it, so the same property holds for the capability check.

4. **Every cross-pillar call bfm makes on the phone's behalf names its downstream scope explicitly (ADR-044).** Unchanged. A capability is not a scope: the capability says what this handset may ask bfm for, the scope says what bfm's service account may ask a sibling for, and both must permit the call. They are enumerated beside each other in `src/contract/capabilities.ts`, and a test fails when a capability names a scope `BFM_SERVICE_ACCOUNT_SCOPES` does not carry — which is what stops a capability being granted for a call bfm would get a 403 for.

5. **Body-size caps are enforced at bfm, not only downstream.** Unchanged.

### What stays on the operator surface

Two kinds of operation do not get a capability, and this is the distinction that replaces the verb ban:

- **Destructive.** Deleting a record, not correcting one. A phone in a pocket, a mis-tap, and a `DELETE` are a bad combination, and the recovery from an incorrect edit is another edit while the recovery from a deletion is a restore.
- **Administrative.** Anything about the federation rather than about the user's own data: revoking a device, minting a pairing code, editing a service account, changing a pillar's settings. Those belong behind Cloudflare Access because the blast radius is the fleet rather than a record.

Everything else is admissible, and is admitted one enumerated capability at a time.

## Consequences

- The `mobile-verbs` guard is gone and `mobile-capabilities` stands in its place. The invariant it enforces is stronger: the old one could only say a route's verb was not one of three, and this one says every route names the authority it requires.
- A `PATCH` under `/mobile` is now a reviewable proposal rather than a build failure. What it must come with is a capability, in the vocabulary, granted to the devices that need it — and the reviewer's question becomes "is this destructive or administrative", which is the question ADR-046's own reasoning was really about.
- A third refusal appears on the mobile perimeter. `401` still means refresh, `403 device_revoked` still means return to pairing — and `403 capability_not_granted` means neither: the credential is good and this handset was not granted this. The iOS client currently folds every `403` into "end the session and wipe the keychain", which is the wrong recovery for the new code (POPS-2459).
- Existing paired devices are grandfathered into the full vocabulary by the migration that adds the column, so this ADR changes no behaviour for the handset in the field on the day it lands. Every future device is granted the same default set at pairing; narrowing a grant per device is an operator surface that does not exist yet (POPS-2460).
- The vocabulary is a closed list in one file, which makes "what can a phone do" a question with a readable answer — and makes widening it a visible diff rather than an emergent property of which routes happen to exist.
- ADR-046 remains readable and is marked superseded rather than deleted. Its account of why a receipt upload and a transaction rewrite are different risks is the reasoning this model implements; only its remedy is reversed.
