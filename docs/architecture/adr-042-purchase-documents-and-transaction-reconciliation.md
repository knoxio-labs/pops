# ADR-042: Purchase documents and transaction reconciliation

## Status

Proposed — 2026-08-02. Introduces the `purchases` pillar (POPS-236).

## Context

A bank transaction is an aggregate. `AMAZON MKTPLACE AU $412.80` records that money moved, and nothing about what was bought. At the scale a household actually transacts — five figures a year across Amazon, PayPal, Woolworths, Coles and Bunnings — the finance pillar can say precisely how much went to a merchant and nothing whatsoever about whether it was worth spending.

The gap is not classification. Finance already classifies well: a seven-stage deterministic ladder resolves a description to a `contacts` entity before AI is consulted at all (`pillars/finance/src/api/modules/imports/README.md`), and learned corrections improve it over time. The ladder answers "who was paid". It structurally cannot answer "what for", because that information is not in the bank feed at any confidence level.

Two further properties of real purchase data make this more than a display problem:

- **The relationship is N:M, not 1:1.** Amazon settles one order as several shipment charges on different dates, and occasionally settles several orders as one charge. Gift cards and rewards balances pay part of an order, so the charge is permanently smaller than the order. Refunds arrive weeks later as separate negative amounts that must net against specific line items.
- **Evidence arrives out of order and arbitrarily late.** A receipt is captured at the till; the card statement that settles it may not be imported for a month or more. Any design in which the receipt must wait for the transaction, or the transaction must arrive before the receipt is useful, is wrong at the point of first contact with the data.

PayPal is a third distinct problem: it is a routing layer rather than a merchant. The bank descriptor is frequently `PAYPAL *` or bare `PAYPAL`, so the receipt is not merely richer than the transaction — it is the only record of who was actually paid.

Cash is a fourth. Cash purchases are rare but real, and no transaction will ever exist for them.

## Options Considered

| Option                                           | Pros                                                                                                                                                      | Cons                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extend `finance` transactions with line items    | No new pillar; line items sit directly beside the amount they explain; no cross-pillar plumbing                                                           | Migration on the largest table in the fleet; forces N:M order-to-transaction structure into a table whose grain is one row per settlement; line items are not only financial — inventory and food are consumers too, and neither should reach through finance to get them |
| A `purchases` module inside the `finance` pillar | Avoids pillar boilerplate; local access to transactions for matching                                                                                      | Grafts a mail poller, per-merchant parsers and a subset-sum solver onto a pillar that already carries the heaviest import pipeline in the repo; still leaves inventory and food consuming purchase data through finance                                                   |
| A separate `purchases` data pillar               | Line items are available to every consumer on equal terms; `finance` needs no schema change; matches the existing soft-URI cross-pillar precedent exactly | A whole pillar's boilerplate — contract, OpenAPI, manifest, Dockerfile, nginx, Litestream config — plus a new gated cross-pillar FE client leg                                                                                                                            |
| Tag transactions more finely instead             | No new storage at all; uses machinery that already exists                                                                                                 | Does not survive contact with the data: one Amazon order spans several tags at once, and a tag cannot carry a quantity, a price, a SKU or a refund                                                                                                                        |
| Buy or self-host an existing receipt tracker     | No build cost                                                                                                                                             | Owns its own entity model and taxonomy; reconciling it against POPS transactions is the same problem again with a foreign schema in the middle                                                                                                                            |

## Decision

**A purchase document with line items is a first-class entity, owned by a new `purchases` data pillar, linked N:M to finance transactions.**

Four decisions follow, and each exists to defeat a specific failure mode above.

### Purchases are authoritative independently of transactions

A purchase with no link is a normal, permanent, valid state. Spend and category analysis read from purchases regardless of link state — a Bunnings receipt captured in October is correct in October, whether or not the card that paid for it is imported in December.

This is what makes cash tractable without any additional mechanism: `settlementMode='cash'` is a terminal state, excluded from the reconcile queue and from any "never settled" prompt, and included in every analysis. The tracking of cash held is a separate finance-side gap (POPS-247).

### Auto-links are re-derived, never patched

> Auto-links are a pure function of (purchases, transactions, confirmed links, rules) scoped to a source and date window.

Unconfirmed links are disposable: a sweep tears down every unconfirmed link in the affected window and re-solves from scratch. Confirmed links — those a user accepted — are pinned, never auto-revised, and act as fixed constraints that remove their purchases and transactions from the solvable set. Three triggers share one idempotent code path: purchase ingest, transaction commit, and a nightly sweep.

The alternative, mutating link state incrementally as evidence trickles in, is what makes late arrival a race. Re-derivation makes arrival order irrelevant by construction, and costs less code than the state machine it replaces.

A consequence worth stating plainly: because the window is over `transaction.date` against `purchase.orderedAt`, and not over when the data was _observed_, the matching window stays narrow (14–21 days, per source). Import lag is absorbed by perpetual retry, not by a wide window. Widening the window to accommodate lag would degrade precision to solve a problem retry already solves.

### Matching is arithmetic, so AI does not do it

The ladder is deterministic first: source-descriptor blocking, exact amount, then subset-sum over the residual window on integer cents — which yields both shipment splits and combined settlements from one algorithm — then partial-payment detection, then learned rules, then a human review queue.

Where subset-sum finds more than one valid partition, the engine does not choose. Ambiguity drops confidence and routes to review. Combined with deterministic candidate ordering, identical inputs always produce identical output, which is the property that makes re-derivation safe.

AI is used where its output can be checked: extracting structure from a photographed receipt, where the extracted line items must sum to the stated total or the purchase is routed to review. This mirrors the posture finance already takes — AI is best-effort and never authoritative — and it is why AI is acceptable for extraction and not for matching, where a model will produce a plausible partition that is arithmetically wrong.

### The residual is a first-class, visible quantity

`purchase.totalCents − Σ linked amountCents` is how gift cards, rewards balances, refunds and genuine misses surface. It is never hidden, absorbed or auto-zeroed, and it aggregates into the metric the feature is judged by: _$10,412 at Amazon, of which $8,900 is explained by line items and $1,512 is not._

A view that silently drops the residual is worse than no view, because it converts a known unknown into a false certainty.

### Reuse, not reinvention

The pillar reuses rather than duplicates: money is integer cents (#3665, CF041); merchants are `contacts` entities where the id is operative and the name is only its label (#3807); tags come from the finance `tag_vocabulary`; learned match rules mirror `transaction_corrections` field-for-field; cross-pillar references are soft `pops://` URIs with a `staleAt` companion resolved by a nightly cron, following `home_inventory.purchaseTransactionUri`; and merchant sources live in a table rather than a compiled enum, per the registry lesson in [ADR-035](adr-035-pillar-redefinition-and-implicit-kinds.md).

## Consequences

- **`finance` is untouched.** No migration on the largest table in the fleet. The link table lives in `purchases`, holding `pops://finance/transaction/<id>` URIs.
- **Existing finance machinery gains line-item granularity for free.** A transaction's effective tags become the roll-up of its linked line items', so budgets and tag rules built for whole transactions start operating on what was actually bought.
- **A new gated cross-pillar FE leg.** Rendering purchase detail in the finance transaction view makes `finance/app → purchases` a sanctioned leg under [ADR-040](adr-040-cross-pillar-contract-discipline.md), requiring both a generated client and an entry in the `cross-pillar-clients` CI job (POPS-241).
- **Ingest is deliberately credential-free at first.** Export and upload adapters (POPS-238, POPS-239, POPS-240) prove reconciliation against real data before any mailbox credential exists. When IMAP ingest arrives (POPS-242), the security control is a server-side mail filter routing receipts to a dedicated label that the pillar reads read-only — the parser is never trusted with mailbox scope.
- **Grocery must be zero-touch or it will be abandoned.** Roughly 6,000 line items a year from Woolworths alone means per-source `autoLinkPolicy`, and grocery never entering the review queue.
- **Fan-out is proposed, never automatic.** Unattended inventory or pantry creation from every durable-looking line item fills those pillars with cables and single-use ingredients, after which the user stops trusting them (POPS-245, POPS-246).
- **The pillar is not cheap.** A full pillar's infrastructure plus a reconciliation engine is the price of line items being available to every consumer on equal terms rather than through finance.
