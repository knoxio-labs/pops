# reconciliation engine

POPS-237: decide which finance transactions settle which charges, and persist the answer.

**The solver is pure — deliberately, and the boundary is exact.** `solve.ts` and its kernels (`subset-sum.ts`, `window.ts`, `descriptor.ts`) touch no database, call nothing, read no clock and use no randomness. `sweep.ts` is the only file here that does I/O: it loads a snapshot, hands it to the solver, and writes the result back.

That split exists because of the invariant the whole design rests on:

> Auto-links are a pure function of (charges, transactions, confirmed links, rules) scoped to a source and date window.

Links are **re-derived from scratch on every sweep, never patched**, so identical inputs must produce identical output. A solver that depended on iteration order, wall-clock time or floating point would make a sweep unlink and relink the same order forever.

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

## The sweep

`runSweep` is one idempotent path, shared by all three triggers. Running it twice over unchanged data reaches the same state, which is what makes it safe to fire from a timer and an ingest hook at once.

Three properties it must have, each with a test that fails loudly if it loses them:

**An unreachable finance skips the sweep entirely.** Candidates are fetched _before_ anything is written, and a non-`ok` fetch returns early. Tearing down links and then re-solving against an empty candidate set would unlink every correctly matched order in the window and report the money as unexplained — an outage silently converted into "you never paid for any of this". This is what the finance client's discriminated result exists to make unmissable.

**Teardown and write are one transaction.** A sweep that discarded links and then failed would leave every order in its window looking unpaid.

**Confirmed links are never touched.** `confirmedAt IS NULL` is the entire teardown predicate, and the schema carries an index for it.

## Derived charges

Amazon's export publishes no charge breakdown at all, so without minting, its 748 orders have nothing to match against and the backfill sits permanently at 100% unexplained.

Before each sweep, every chargeless order gets one `derived` charge for its total. `origin='derived'` marks it as the engine's inference rather than a figure the merchant stated, so a later ingest that _does_ state charges is distinguishable. Minting is idempotent because the query only selects orders with no charge at all — and once minted the row persists: teardown removes links, never charges, because a charge is a fact about the order rather than a guess about the statement.

Cash orders are excluded from all of it. `settlementMode='cash'` is terminal, so including one would put a permanently unmatchable row in the review queue every night — the false alarm that teaches someone to stop reading the queue.

## What slice 2 does not do

`combined` (several charges settled by one transaction) is the same subset-sum with the sides exchanged. It needs to consider an order's charges as a group rather than one at a time, which is a change to the solver's traversal rather than to its arithmetic. The `combined` link type exists in the vocabulary and is not yet produced.

The three **triggers** are not wired: nothing calls `runSweep` yet. Nor is the contract surface — reconcile queue, confirm, unlink — so `confirmLink` exists and has no route.
