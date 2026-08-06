# reconciliation solver

The arithmetic core of POPS-237: given a snapshot of charges, candidate transactions and confirmed links, decide which links to propose.

**Pure.** Nothing here touches the database, calls finance, reads a clock or uses randomness. That is not tidiness — it is the invariant the whole design rests on:

> Auto-links are a pure function of (charges, transactions, confirmed links, rules) scoped to a source and date window.

Links are **re-derived from scratch on every sweep, never patched**, so identical inputs must produce identical output. A solver that depended on iteration order, wall-clock time or floating point would make a sweep unlink and relink the same order forever.

This directory is slice 1. The sweep that tears down unconfirmed links, the three triggers that drive it, and the review-queue endpoints are separate work; nothing here writes anything.

## The ladder

Deterministic first, AI never. Matching is arithmetic, and a model asked to partition a set of amounts produces a plausible partition that is wrong.

| stage | what                                                     | link type |
| ----- | -------------------------------------------------------- | --------- |
| 0     | block: unclaimed, in window, descriptor match, same sign | —         |
| 1     | exactly one transaction for the charge amount            | `exact`   |
| 2     | subset-sum over the remaining candidates                 | `split`   |
| 3     | one candidate smaller than the charge — a part-payment   | `partial` |
| 5     | anything ambiguous or unmatched                          | review    |

**Stage 4, learned rules, is deliberately absent.** `purchase_match_rules` is a descriptor-pattern table mirroring finance's `transaction_corrections` — `descriptionPattern`, `matchType`, `source`, `priority` — not a purchase-to-transaction pointer. What a matched pattern should do to the ladder depends on how the review queue writes rules when a user accepts a link (POPS-241), so implementing it now would embed a second, incompatible rule model in the engine. It has its own slice.

## Ambiguity is a signal, not a coin flip

Every stage that could pick between equally-good candidates routes to review instead. Two transactions of the same amount in one window is not a tie to break — it is a duplicate charge and its correction, and choosing gets it wrong half the time.

`partial` is the most conservative stage for the same reason: "the charge is larger than this transaction" describes every unrelated transaction in the window too, so it fires only when exactly one candidate remains. With two, the residual it would record is a number invented to make the arithmetic close.

## Three things in the arithmetic that are easy to get wrong

**Zero amounts are excluded from subset-sum.** A zero-valued candidate can be added to or removed from any solution without changing its sum, so a single zero turns every unique answer ambiguous and sends a whole window to review for no reason. Finance can legitimately carry a zero-amount transaction.

**Sign is never mixed.** Only candidates with the same sign as the target take part. Without that guard, a refund and a purchase cancel out to hit a target neither belongs to — arithmetically valid, factually absurd — and a refund can be "settled" by an ordinary purchase of the same magnitude.

**The candidate ceiling is about honesty, not cost.** 2^12 subsets is trivial to enumerate. The bound exists because as a window gets more crowded, the number of subsets that coincidentally hit any given total grows with it. A wider window does not find better answers, it finds more coincidences, so a window past the ceiling is refused rather than searched.

## The descriptor pattern is LIKE, not a substring

`purchase_sources.descriptorPattern` had no documented format, and the repo disagreed with itself: the source fixtures store `AMAZON%` and `BUNNINGS%` while the Amazon ingest CLI registered a bare `AMAZON`. Under substring matching the first matches nothing; under LIKE the second matches only a descriptor that is exactly `AMAZON`. Either reading silently blocks a source's entire backlog into review.

It is **LIKE**, matching what the stored data already assumed: `%` is any run of characters, `_` is exactly one, the pattern is anchored and matching is case-insensitive. A pattern with no wildcard is therefore an equality test — which is why the CLI was corrected to write `AMAZON%`.

Patterns are compiled with regex metacharacters escaped first, because `PAYPAL *MERCHANT` is a real bank descriptor and an unescaped `*` would be read as a quantifier.

## The window

`purchases.orderedAt` is a full ISO instant; a finance transaction carries a date-only `YYYY-MM-DD`. The rule is **UTC calendar dates, inclusive at both ends** — see `window.ts`. Truncating to UTC rather than local keeps the boundary stable regardless of where the process runs, because a container's timezone is not a property of the purchase.

The window is symmetric: a card is normally charged after the order, but a pre-authorisation lands before it and a till receipt can be dated a day ahead of the statement entry that settles it.

It stays narrow (14–21 days, per source). Import lag is absorbed by perpetual retry, not by widening it.

## Confirmed links are constraints, not suggestions

A confirmed link removes **both** its charge and its transaction from the solvable set. That is what makes a human decision durable: the pinned transaction cannot be re-used to satisfy some other order on the next sweep.

Feeding the solver's own output back as confirmed produces no further proposals — the property that makes re-derivation safe to run on a timer.

## What slice 1 does not do

`combined` (several charges settled by one transaction) is the same subset-sum with the sides exchanged, but it needs to see all of an order's charges at once, which belongs with the sweep. The `combined` link type exists in the vocabulary and is not yet produced here.

Minting a `derived` charge for an order whose source states none — every Amazon order — also belongs to the caller: this solver matches charges it is given.
