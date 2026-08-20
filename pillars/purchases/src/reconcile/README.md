# reconciliation engine

POPS-237: decide which finance transactions settle which charges, and persist the answer.

**The solver is pure — deliberately, and the boundary is exact.** `solve.ts` and its kernels (`subset-sum.ts`, `window.ts`, `descriptor.ts`) touch no database, call nothing, read no clock and use no randomness. `sweep.ts` is the only file here that does I/O: it loads a snapshot, hands it to the solver, and writes the result back.

That split exists because of the invariant the whole design rests on:

> Auto-links are a pure function of (charges, transactions, confirmed links, rules) scoped to a source and date window.

Links are **re-derived from scratch on every sweep, never patched**, so identical inputs must produce identical output. A solver that depended on iteration order, wall-clock time or floating point would make a sweep unlink and relink the same order forever.

## The ladder

Deterministic first, AI never. Matching is arithmetic, and a model asked to partition a set of amounts produces a plausible partition that is wrong.

| stage | what                                                                   | link type |
| ----- | ---------------------------------------------------------------------- | --------- |
| 0     | block: unclaimed, not rejected, in window, descriptor match, same sign | —         |
| 1     | exactly one transaction for the charge amount                          | `exact`   |
| 2     | subset-sum over the remaining candidates                               | `split`   |
| 4     | a learned merchant descriptor, at exactly the charge amount            | `rule`    |
| 3     | one candidate smaller than the charge — a part-payment                 | `partial` |
| 5     | anything ambiguous or unmatched                                        | review    |

Stage 4 runs between combined and partial, which is why the table is out of numerical order.

## Stage 4 widens blocking and nothing else

A rule is a **descriptor pattern** mirroring finance's `transaction_corrections` (`descriptionPattern`, `matchType`, `source`, `priority`), not a purchase-to-transaction pointer. It says which transactions look like a merchant; it cannot say which transaction settled an order. So the only thing it is allowed to change is **which descriptors count as that source's** — the candidate it admits then has to pass stage 1's amount test unchanged.

The case it exists for is the one digit-stripping exists for. `purchase_sources.descriptorPattern` is a single pattern registered by hand, and a merchant bills under a store number that varies: a pattern written from one statement line blocks every other store forever, and the queue never asks about them because blocking removed the evidence. The rule a confirm writes is that descriptor with its digits stripped, so `WOOLWORTHS 1234 SYDNEY` teaches the pattern that also matches `WOOLWORTHS 5567 SYDNEY`.

The two alternatives were rejected, and they are the ones that manufacture wrong links:

- **Promoting confidence** so a borderline stage fires. The stages that decline are declining on ambiguity, and a rule that named the merchant cannot break a tie between two of that merchant's transactions — it is evidence about the descriptor both of them already share.
- **Licensing a near-miss amount.** This undercuts the premise the whole engine rests on. A stale rule — the merchant changed nothing, this simply is not the transaction that settled the order — would then reconcile money to the wrong purchase and record confidence for it. Silence costs a link that was never available; the alternative costs a wrong one.

So a stage-4 miss costs nothing: a rule that admits no candidate at the charge amount leaves the charge to partial and review exactly as if it did not exist, and stage 4 runs no subset-sum of its own.

**One exception, and it is deliberate.** Two rule-admitted candidates for exactly the charge amount settle the charge into review as ambiguous, so it never reaches partial — a charge the ladder would otherwise have part-paid from some smaller transaction. That is the presence of a rule changing an outcome the rule cannot itself settle, and it is the safe direction: two transactions from a merchant a human has accepted, each for exactly this charge, say one of them settled it, and the ladder does not invent a residual to avoid asking. Stage 1 declines the same shape the same way.

**Ordering.** After combined, because a partition that closes exactly is stronger evidence than a learned descriptor. Before partial, for two reasons: a rule is a decision a human already made, and partial **consumes a transaction** — running it first lets one speculative part-payment claim the very transaction the rule was written about, silently disabling the correction.

**Selection is `priority ASC, id ASC`**, the convention finance already uses, applied in the solver rather than left to the reader's `ORDER BY`. More than one rule can match, and the link records which one was responsible, so a `.find()` over whatever order the reader returned would make the output depend on its input's order.

Every other blocking test still applies — window, sign, non-zero, and the rejection set. A rule can therefore never resurrect a pairing a human ruled out, which is where the negative signal lives: rejections are stored as pairings, not as negative rules (see below).

**A rule's own confidence caps the link's, and the stage caps that.** The rule inherits the confidence of the link that taught it, so one learned from a part-payment stays weaker than one learned from an exact match, and both sit below a plain `exact`. A rule below `MIN_MATCH_CONFIDENCE` never fires at all.

**The sweep does not touch `timesApplied` or `lastUsedAt`.** Those record attributions a rule has earned — one per human decision, never revised downward — and unconfirmed links are re-derived from scratch on a timer, so counting an auto-link would add one every fifteen minutes for a link that never changed. The count happens when a stage-4 link is confirmed, which is also when the descriptor is re-recorded against the same rule row.

What the sweep does report is `ruleLinksProposed`, the number of its proposals that came from stage 4, on the result and in the completion log line. Without it the stage is invisible in production: the rule table's counters answer a question about decisions, so a rule auto-linking money every night would look identical to one that has never matched anything. Attributing that count to individual rules is a separate piece of work, tracked in POPS-2377.

**What bounds the stage's reach today is the writer, not the reader.** A rule can only be learned from a descriptor that was already proposed, and nothing proposes a blocked one — there is no route that links a charge to a transaction by hand. So the reachable wins are the ones where normalisation is what widens the pattern (store numbers, order references), not the ones where a human names a descriptor the source has never matched. Giving the operator a way to do the latter is tracked separately.

## What a decision persists

A decision that changed nothing durable is the reason the queue used to re-ask the same question forever. Three routes, three different amounts of memory:

| route     | link    | what survives the next sweep                                      |
| --------- | ------- | ----------------------------------------------------------------- |
| `confirm` | pinned  | the link, **and** a `purchase_match_rules` row for the descriptor |
| `reject`  | deleted | a `purchase_link_rejections` row for the pairing                  |
| `unlink`  | deleted | nothing — by design                                               |

**A confirm learns the merchant, not the link.** The rule is keyed on the accepted transaction's descriptor, normalised so a store number or an order reference does not become part of the pattern (`WOOLWORTHS 1234 SYDNEY` and `WOOLWORTHS 5567 SYDNEY` are one merchant), and scoped to the order's own `source`. The link then carries `match_rule_id`, so a link can be explained by naming the rule behind it — and a stage-4 link carries it from the moment it is proposed, naming the rule that admitted its descriptor. A confirm fills that column in and never revises it: the rule a decision teaches is keyed on the exact descriptor, which for a `contains` or `regex` rule is a different row from the one that proposed the link, and re-pointing it there would credit the decision to a rule that had nothing to do with it. A descriptor that normalises to nothing (a terminal emitting a bare reference) writes no rule and still pins the link; refusing a real decision to protect an empty pattern would be the wrong trade.

The descriptor comes from `purchase_charge_links.transaction_description`, written when the sweep proposes the link. The alternatives were both worse: asking finance during the decision makes an accept fail whenever the peer is down, and taking the descriptor from the request body trusts the caller with the value the rule is keyed on.

**`timesApplied` is a history, not a live count.** It records the attributions a rule has earned and is never revised downward, which is what the column name says and what finance means by the same column on `transaction_corrections`. Unlinking or rejecting a confirmed link does not un-apply the rule that explained it, and a link removed by a purchase's cascade could not be reflected here at all — so a counter that tried to equal "links currently naming this rule" would look exact and drift silently. What the writer does owe it is one count per attribution, which is why confirming an already-confirmed link is a no-op.

**A reject is stored as a pairing, not as a negative rule.** The narrowest negative a descriptor-pattern table can express is "descriptors like this never settle this source" — a claim about every future order from the merchant, inferred from one click. When the engine merely picked the wrong one of a merchant's two charges, that inference disables matching for the merchant entirely. What the rejection actually establishes is that these two rows are not a pair, so that is what is stored, and stage 0 consults it.

It is stored in its own table rather than as a column on the link, because a rejected link is not a link: leaving the row would make every reader that sums linked money — the accounting split, the merchant roll-up — count rejected money as matched unless each remembered to exclude it.

## Three phases, not one loop

Exact, split and partial are per-charge: they ask what settles _this_ charge. **Combined cannot be**, which is why the traversal has phases at all — deciding that several charges together settle one transaction means seeing them together, and a loop considering one charge at a time can only ask "does something here sum to _me_".

So: per-charge exact and split, then combined over everything they left untouched, then per-charge learned rules, then per-charge partial, then review.

Every boundary carries a reason, and every one has a test that fails if the phases are swapped:

- **exact and split before combined** — a charge with its own exact match should take it rather than being swept into someone else's partition.
- **combined before partial** — partial is the weakest guess the ladder makes _and it consumes a transaction_. Running it first lets one speculative part-payment claim the very transaction a clean multi-charge partition needed, leaving those charges with nothing. Learned rules sit in that gap for the same reason, from the other side: see above.

A phase-ordering test is only a test if BOTH phases can settle the charge it contests. One built on a world where the later phase has nothing to say is green with the phases swapped and green with the phase deleted — so each of the stage-4 boundary tests is paired with the run that shows the rule firing on the same charge when nothing competes for it.

A charge only joins a combination if the transaction is eligible for it on its own terms — inside _its_ window, matching _its_ source descriptor, same sign. Amounts adding up is not a reason to link across merchants or across years.

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

A rejection is the mirror image and removes **neither**. It says the engine paired the wrong two things, not that the transaction is spent, so the transaction stays in the pool for the charge that does settle it — which the same sweep can then claim. Getting this backwards would turn one click into an unexplained order nobody looked at.

## The sweep

`runSweep` is one idempotent path, shared by all three triggers. Running it twice over unchanged data reaches the same state, which is what makes it safe to fire from a timer and an ingest hook at once.

Three properties it must have, each with a test that fails loudly if it loses them:

**An unreachable finance skips the sweep entirely.** Candidates are fetched _before_ anything is written, and a non-`ok` fetch returns early. Tearing down links and then re-solving against an empty candidate set would unlink every correctly matched order in the window and report the money as unexplained — an outage silently converted into "you never paid for any of this". This is what the finance client's discriminated result exists to make unmissable.

**Teardown and write are one transaction.** A sweep that discarded links and then failed would leave every order in its window looking unpaid.

**Confirmed links are never touched.** `confirmedAt IS NULL` is the entire teardown predicate, and the schema carries an index for it.

## Derived charges

Amazon's export publishes no charge breakdown at all, so without minting, its 748 orders have nothing to match against and the backfill sits permanently at 100% unexplained.

After a successful candidate fetch, every order no charge claims any of gets one `derived` charge for its total. `origin='derived'` marks it as the engine's inference rather than a figure the merchant stated, so a later ingest that _does_ state charges is distinguishable. Minting is idempotent because the minted `capture` takes the order out of the selection — and once minted the row persists: teardown removes links, never charges, because a charge is a fact about the order rather than a guess about the statement.

A refund does not count as a claim on the total: it states what came back, never what was paid, so a refunded order is minted a capture just as an untouched one is. `capture` and `adjustment` do count, and an order stating either is left alone — the minted charge is the full order total, so minting on top of one would drive the residual negative, which is a worse lie than leaving the order unexplained.

`authorization` also leaves an order alone, but not for that reason. It is excluded from every accounting bucket, so an authorization-only order already reads as a full residual and minting would resolve rather than over-explain it. It is held out because an authorization is the merchant's own record of a payment whose capture the merchant states itself, and a minted second record of that one payment leaves two near-identical charges competing for one transaction. No adapter emits the role, so the choice has never been exercised against real data.

Cash orders are excluded from all of it. `settlementMode='cash'` is terminal, so including one would put a permanently unmatchable row in the review queue every night — the false alarm that teaches someone to stop reading the queue.

## The three triggers

`runner.ts` is scheduling and nothing else — all the behaviour is in the sweep. ADR-042 names the triggers and they share one operation:

1. **Purchase ingest** — `POST /purchases` calls `request()` after a successful write.
2. **Transaction commit** — a poll, every 15 minutes. Finance gets no webhook and no schema change (ADR-042), and perpetual retry is already how import lag is absorbed, so a timer is both sufficient and the only option that leaves the producer untouched.
3. **Nightly** — the backstop for whatever the other two missed while the process was down.

**Coalescing is why this file exists** rather than each trigger calling `runSweep`. A backfill posts 748 orders in about a second; a sweep per ingest would run 748 full reconciliations, each re-solving what the last just did and each asking finance for the same window. Requests inside one five-minute window collapse into a single run, and a request arriving _during_ a run schedules exactly one more — so the last order of a burst is never left unswept.

The ingest trigger is fired after the write and its errors are swallowed. The order is already committed by then, so letting a scheduling failure turn a successful ingest into a 500 would make the caller retry a write that already happened — and a backfill would report failures for orders sitting in the database.

Cadence is overridable via `PURCHASES_SWEEP_COALESCE_MS` and `PURCHASES_SWEEP_POLL_MS`. A malformed value crashes boot rather than falling back, because a silently-default cadence looks exactly like the setting having worked.

## Zero-touch sources

`purchase_sources.autoLinkPolicy` decides whether a source's charges are allowed to interrupt. It was a column that nothing read until POPS-239 needed it.

`auto` means **do not ask** — it does _not_ mean auto-confirm. Confirming would pin the links against re-derivation, which contradicts the invariant the whole engine rests on. Auto-linked charges keep unconfirmed, re-derivable links; they simply stay out of the daily queue.

The arithmetic behind that: a weekly grocery shop is roughly 60 line items, about 6,000 a year from one merchant. If each of those charges asked a question, the queue stops being usable and gets abandoned — taking the orders that genuinely need a decision with it (ADR-042).

They are excluded, not hidden: `includeAuto=true` surfaces the low-priority bucket for the merchant lens. And a source with **no registered row at all** is treated as `review`, because an unregistered merchant is the one most likely to want looking at — silence would be exactly the wrong default.

## Testing this across processes

Two layers run in CI, each covering what the one below cannot:

| layer                  | what only it proves                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `finance-http.test.ts` | the SDK proxy really resolves and calls, in-process                                             |
| `two-process.test.ts`  | the real entry point boots, migrates a fresh DB, starts the runner and reconciles over a socket |

A third layer, `infra/smoke/purchases-reconcile.sh`, covers what neither of those can: the Docker network and the compose file. It is **operator-verified only** — no CI lane runs it, scheduled or otherwise, and there is deliberately no plan to change that here. It needs a service-account key in `POPS_INTERNAL_API_KEY`, granted `purchases.source` and `purchases.purchase`; minting one in CI would mean either storing a long-lived credential as a repo secret against a stack the CI run does not own, or running the compose stack with `NODE_ENV` off `production` so the registry's dev-fallback identity can self-mint one — and that changes what the smoke test is actually exercising. Both are a real decision for whoever owns that credential and that stack, not a default to reach for from inside a fix elsewhere in `scripts/` (POPS-1972).

Concretely: this script is **not part of the CI gate**. It presents its key on every call into the purchases contract and refuses to start without one (POPS-1806) — but nothing runs it, so a regression in that presentation (wrong header, wrong host, a stale variable name) is caught only when an operator runs the script by hand. `backfill.test.ts` under `pillars/purchases/scripts/__tests__/` covers the equivalent credential-presentation behaviour for the TypeScript ingest CLIs, which is exercised the ordinary way in CI; this script has no equivalent, and a text-matching regex over its contents was rejected as worse than no coverage — it would assert spelling, not behaviour, and pass against a script that sends the header to the wrong place.

Reviewing a change to this script therefore means reading it as carefully as the tests it does not have: run it by hand (`POPS_INTERNAL_API_KEY=<key> ./infra/smoke/purchases-reconcile.sh`) before merging anything that touches its request or auth handling. Its `/health` probes carry no key, health being outside the contract and gated by nothing, and neither does its finance seed — that is a call into another pillar, where a purchases-scoped key would be held to a grant it does not have.
