# finance read leg

Reads candidate transactions from the `finance` pillar so the reconciliation ladder (POPS-237) has something to match charges against. Read-only: nothing here writes to finance, and finance has no idea this pillar exists (ADR-042).

## Why it is shaped like this and not generated

Backend-to-backend cross-pillar calls go through the `@pops/pillar-sdk` `pillar('<id>')` proxy with a **hand-written narrow router type**. That is the established pattern — `pillars/finance/src/api/contacts/client.ts` is the template, and no backend pillar in the fleet declares a runtime dependency on another pillar's package.

Two things that look like they should apply here and do not:

- **The `cross-pillar-clients` CI job does not cover this.** It gates browser-facing per-consumer generated clients, and ADR-040's whole regenerate-and-diff apparatus is scoped to that surface. There is no backend equivalent.
- **ADR-033 vendoring does not apply either.** A vendored OpenAPI snapshot is required when the producer has no npm package — the Rust `contacts` pillar. `finance` is an ordinary TS pillar.

Depending on `@pops/finance` would buy nothing anyway: `pillar<TRouter>()` is typed by the **caller**, and the proxy resolves routes from the producer's OpenAPI at runtime, so there is no compile-time link to break. The local router type is an assertion, not a check.

**Which is exactly why the response is validated with zod** (`wire.ts`). For a name lookup an unchecked assertion is tolerable. For the numbers a subset-sum runs on it is not: a producer-side shape change would otherwise surface as wrong arithmetic rather than as a failure. The schema is the substitute for the gate this leg cannot have.

The proxy resolves `handle.transactions.list` by joining the property chain with `.` and looking it up as an `operationId`. Finance publishes `transactions.list` for `GET /transactions`, so the chain and the contract line up — if that operationId ever changes, this leg fails at runtime, not at build.

## The money boundary

**Finance persists integer cents and publishes decimal dollars.** Its `money.ts` converts with `cents / 100` at the REST edge; the wire field is `amount: number`.

This pillar's premise is the opposite — subset-sum is exact over integers and over nothing else. So the float is converted to cents at the boundary, with `Math.round`, and `CandidateTransaction` deliberately **has no `amount` field at all** so a dollar value cannot reach the solver by being passed through.

Rounding rather than truncating is load-bearing: `19.99 * 100` is `1998.9999999999998`, and truncating lands a cent short. A test asserts the `cents / 100 → round(× 100)` round-trip is exact across the range, which is the property that makes an exact-amount match findable.

## An outage is not an empty window

`fetchCandidates` returns a **discriminated result, not an array** — the one place this departs from the contacts client it is modelled on.

The contacts client substitutes an empty set when its producer is down. That is right for name matching: a no-match run is harmless. Here it would be catastrophic. Auto-links are re-derived by tearing down every unconfirmed link in a window and re-solving against what is found, so an outage that reads as "no transactions exist" would unlink correctly matched orders across the fleet and report the money as unexplained.

So `unavailable` and an empty `ok` are different values, and a sweep receiving `unavailable` must do nothing and retry later rather than re-solve.

The same reasoning makes truncation a failure rather than a short read: a partial window looks complete to the solver, which then produces confident wrong answers. Both the paging safety cap and a mid-sweep outage therefore return `unavailable`, discarding the rows already collected.

**`reason` is where a credential problem is named.** Writing nothing is the right answer whether finance is down or refusing this pillar's key, but the two want different actions from whoever reads the sweep's `skipped` line, so a refusal carries `unauthorized` and a process with no key at all carries `no-credential` — never a bare outage. Both also log a line naming the service account. The credential itself comes from `pillar()` on `@pops/pillar-sdk/server`; the pillar README's "Who it calls, and as whom" has the grant.

## What finance can and cannot filter

`GET /transactions` accepts `search`, `account`, `startDate`, `endDate`, `tag`, `entityId`, `type`, `limit` (**capped at 500**) and `offset`, returning `{ data, pagination }`.

**This leg uses four of them** — `startDate`, `endDate`, `search` and the paging pair. The rest are available and deliberately unused: `entityId` and `tag` describe finance's own classification of a transaction, and a charge should match on date and amount regardless of how finance happens to have categorised it. Narrowing by them would hide exactly the mis-categorised transactions reconciliation most needs to find.

There is **no amount filter** in that set, so amount narrowing happens in the solver after the window pull. `search` is a substring filter used for stage-0 descriptor blocking from `purchase_sources.descriptorPattern`; it narrows the pull and never decides a match.

Two shape mismatches the caller has to handle: finance's `date` is a date-only `YYYY-MM-DD`, while `purchases.orderedAt` is a full ISO timestamp; and there is no "already linked" flag on the wire — `relatedTransactionId` covers finance's own transfer pairs and says nothing about this pillar's links.
