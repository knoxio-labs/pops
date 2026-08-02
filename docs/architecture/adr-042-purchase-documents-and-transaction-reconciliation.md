# ADR-042: Purchase documents and transaction reconciliation

## Status

Accepted — 2026-08-01. Introduces the `purchases` pillar (POPS-236).

Amended 2026-08-03, while implementing the skeleton and before any data existed. The original decision — a separate pillar, links re-derived rather than patched, matching by arithmetic rather than AI, a visible residual — stands unchanged. What the amendment adds is the **grain**, which the original stated only as "line items" and which contact with a real Amazon export showed to be four levels rather than two. See [Grain](#grain-four-levels-not-two) and [Charges do not depend on finance](#charges-do-not-depend-on-finance).

## Context

A bank transaction is an aggregate. `AMAZON MKTPLACE AU $412.80` records that money moved, and nothing about what was bought. At the scale a household actually transacts — five figures a year across Amazon, PayPal, Woolworths, Coles and Bunnings — the finance pillar can say precisely how much went to a merchant and nothing whatsoever about whether it was worth spending.

The gap is not classification. Finance already classifies well: a seven-stage deterministic ladder resolves a description to a `contacts` entity before AI is consulted at all (`pillars/finance/src/api/modules/imports/README.md`), and learned corrections improve it over time. The ladder answers "who was paid". It structurally cannot answer "what for", because that information is not in the bank feed at any confidence level.

Three further properties of real purchase data make this more than a display problem:

- **The relationship is N:M, not 1:1.** Amazon settles one order as several shipment charges on different dates, and occasionally settles several orders as one charge. Gift cards and rewards balances pay part of an order, so the charge is permanently smaller than the order. Refunds arrive weeks later as separate negative amounts that must net against specific line items.
- **Deliveries are a third axis, independent of both.** One order arrives in several boxes, each with its own carrier, tracking number, arrival date and postage — and an AliExpress order's boxes can be months apart. Crucially, the way a merchant groups _charges_ need not correspond to the way it groups _boxes_: Amazon sometimes charges per product group rather than per shipment. A model that assumes one implies the other will be wrong on real data and will have no way to express that it is wrong.
- **Evidence arrives out of order and arbitrarily late.** A receipt is captured at the till; the card statement that settles it may not be imported for a month or more. Any design in which the receipt must wait for the transaction, or the transaction must arrive before the receipt is useful, is wrong at the point of first contact with the data.

PayPal is a fourth distinct problem: it is a routing layer rather than a merchant. The bank descriptor is frequently `PAYPAL *` or bare `PAYPAL`, so the receipt is not merely richer than the transaction — it is the only record of who was actually paid.

Cash is a fifth. Cash purchases are rare but real, and no transaction will ever exist for them.

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

Six decisions follow, and each exists to defeat a specific failure mode above.

### Grain: four levels, not two

The unit of ingest is the **order**. Hanging off it are three flat lists — **deliveries**, **lines**, and **charges** — plus **units** below a line where one physically exists:

```
purchases  (the order)
  ├─ purchase_shipments             every delivery
  ├─ purchase_items                 every line, complete
  │    └─ purchase_item_units       per-unit identity → inventory
  ├─ purchase_charges               every charge
  │    ├─ purchase_charge_links     charge → finance transaction
  │    └─ purchase_item_allocations which charge paid for which line
  └─ purchase_documents             evidence → documents
```

The order is the single point of entry, so a consumer needs one lookup rather than a traversal. The lists below it are siblings, not a hierarchy, and **every cross-reference between them is nullable** — a line need not name a delivery, a charge need not name either. That is what lets the model stay correct while the merchant's grouping rules are still unknown: an unattributable charge is recorded as belonging to the order, which is always true, rather than forced into a delivery it may not belong to.

Two consequences of collapsing grains, both of which an earlier draft hit:

- Making the _shipment_ the unit of ingest destroys the order's identity — twelve rows sharing an order-id string and nothing tying them together. Making the _order_ the only unit destroys carrier, tracking, arrival date and per-box postage.
- Hanging the inventory reference off the line cannot express a quantity of three. Three physical things with three serial numbers and three warranties need three rows, which is what units are for.

A deliberate non-decision: **no "charge block" entity.** Merchants clearly group charges somehow, but whether that grouping corresponds to deliveries is unverified for Amazon and unknown for AliExpress. Inventing the entity now would encode a guess into the schema; leaving `purchase_charges.shipment_id` nullable lets the answer emerge from data. If the column turns out to be reliably populated, the entity can be introduced then, with evidence.

### Charges do not depend on finance

A charge is recorded when the merchant states it. The link to a `finance` transaction is a separate row that appears only once that transaction is imported.

Modelling a charge _as_ the link — which the original draft did, by naming the table `purchase_transaction_links` and giving it no existence of its own — makes the gap between "Amazon charged the card on the 2nd" and "the statement was imported in March" invisible. For those weeks the order is indistinguishable from one nobody ever paid for.

The split makes the useful question answerable, and it is three questions rather than one:

|                 | meaning                             | action        |
| --------------- | ----------------------------------- | ------------- |
| matched         | charged, and a transaction backs it | none          |
| awaiting import | charged, no transaction yet         | wait          |
| residual        | no charge accounts for it           | a human looks |

Only the third warrants attention. Reporting the second as a residual would flag every recent order as broken until its statement imports, which is precisely the false alarm that trains someone to stop reading the number — defeating the purpose the residual exists for.

### Purchases are authoritative independently of transactions

A purchase with no link is a normal, permanent, valid state. Spend and category analysis read from purchases regardless of link state — a Bunnings receipt captured in October is correct in October, whether or not the card that paid for it is imported in December.

This is what makes cash tractable without any additional mechanism: `settlementMode='cash'` is a terminal state, excluded from the reconcile queue and from any "never settled" prompt, and included in every analysis. The tracking of cash held is a separate finance-side gap (POPS-247).

### Auto-links are re-derived, never patched

> Auto-links are a pure function of (charges, transactions, confirmed links, rules) scoped to a source and date window.

Unconfirmed links are disposable: a sweep tears down every unconfirmed link in the affected window and re-solves from scratch. Confirmed links — those a user accepted — are pinned, never auto-revised, and act as fixed constraints that remove their charges and transactions from the solvable set. Three triggers share one idempotent code path: purchase ingest, transaction commit, and a nightly sweep.

Charges, not orders, are what the solver matches. An order whose merchant states three separate charges presents three amounts to match rather than one total, which is both easier and more accurate — and an order whose source states no charges at all still works, because the engine mints a `derived` charge to hold the transaction it finds.

Determinism has a prerequisite that is easy to miss: the candidate list must have a stable order, and row ids are random UUIDs written within the same second, so ordering by id or creation time is not stable at all. Lines, deliveries and charges therefore carry an explicit `position` from the source document. Without it, re-derivation can produce a different partition from identical inputs, which is exactly what re-derivation is supposed to rule out.

The alternative, mutating link state incrementally as evidence trickles in, is what makes late arrival a race. Re-derivation makes arrival order irrelevant by construction, and costs less code than the state machine it replaces.

A consequence worth stating plainly: because the window is over `transaction.date` against `purchase.orderedAt`, and not over when the data was _observed_, the matching window stays narrow (14–21 days, per source). Import lag is absorbed by perpetual retry, not by a wide window. Widening the window to accommodate lag would degrade precision to solve a problem retry already solves.

### Matching is arithmetic, so AI does not do it

The ladder is deterministic first: source-descriptor blocking, exact amount, then subset-sum over the residual window on integer cents — which yields both shipment splits and combined settlements from one algorithm — then partial-payment detection, then learned rules, then a human review queue.

Where subset-sum finds more than one valid partition, the engine does not choose. Ambiguity drops confidence and routes to review. Combined with deterministic candidate ordering, identical inputs always produce identical output, which is the property that makes re-derivation safe.

AI is used where its output can be checked: extracting structure from a photographed receipt, where the extracted line items must sum to the stated total or the purchase is routed to review. This mirrors the posture finance already takes — AI is best-effort and never authoritative — and it is why AI is acceptable for extraction and not for matching, where a model will produce a plausible partition that is arithmetically wrong.

### The residual is a first-class, visible quantity

`purchase.totalCents − Σ charge amounts` is how gift cards, rewards balances, refunds and genuine misses surface. It is never hidden, absorbed or auto-zeroed, and it aggregates into the metric the feature is judged by: _$10,412 at Amazon, of which $8,900 is explained by line items and $1,512 is not._

A view that silently drops the residual is worse than no view, because it converts a known unknown into a false certainty. A view that clamps it at zero is worse still: a negative residual means the order was over-charged, which is a bug, and hiding it removes the only signal that the bug exists.

Two amounts, not one, because currency makes them different. A charge carries what actually moved on the card and the same money expressed in the order's currency; the matcher compares the first against `finance`, the residual sums the second. A USD AliExpress order settling as AUD is unmatchable otherwise.

Card **authorizations** are recorded but excluded from the residual. A hold and its later capture are two transactions for one payment, and counting both makes a correctly-settled order look doubly paid.

### Reuse, not reinvention

The pillar reuses rather than duplicates: money is integer cents (#3665, CF041); merchants are `contacts` entities where the id is operative and the name is only its label (#3807); tags come from the finance `tag_vocabulary`; learned match rules mirror `transaction_corrections` field-for-field; cross-pillar references are soft `pops://` URIs with a `staleAt` companion resolved by a nightly cron, following `home_inventory.purchaseTransactionUri`; and merchant sources live in a table rather than a compiled enum, per the registry lesson in [ADR-035](adr-035-pillar-redefinition-and-implicit-kinds.md).

## Consequences

- **`finance` is untouched.** No migration on the largest table in the fleet. The link table lives in `purchases`, holding `pops://finance/transaction/<id>` URIs.
- **Existing finance machinery gains line-item granularity for free.** A transaction's effective tags become the roll-up of its linked line items', so budgets and tag rules built for whole transactions start operating on what was actually bought.
- **A new gated cross-pillar FE leg.** Rendering purchase detail in the finance transaction view makes `finance/app → purchases` a sanctioned leg under [ADR-040](adr-040-cross-pillar-contract-discipline.md), requiring both a generated client and an entry in the `cross-pillar-clients` CI job (POPS-241).
- **`documents` becomes a fourth seam.** The Amazon DSAR bundle alone ships 325 tax-invoice PDFs and a delivery-photo manifest, and a tax invoice is the arbiter whenever a CSV's own arithmetic is ambiguous. Evidence attaches to an order or to a single delivery, as a soft `pops://documents/...` URI with a `staleAt` companion — the same treatment every other cross-pillar reference here gets. Without it the evidence is discarded at ingest and the ambiguity becomes permanent.
- **Inventory's seam is per unit, not per line.** A durable line of quantity three proposes three inventory items, each with its own warranty, location and resale value, so the reference lives on `purchase_item_units`. Landed cost — the line total plus its share of postage and order-level adjustment — is what inventory should value an item at, not the sticker price (POPS-47).
- **Ingest is deliberately credential-free at first.** Export and upload adapters (POPS-238, POPS-239, POPS-240) prove reconciliation against real data before any mailbox credential exists. When IMAP ingest arrives (POPS-242), the security control is a server-side mail filter routing receipts to a dedicated label that the pillar reads read-only — the parser is never trusted with mailbox scope.
- **Grocery must be zero-touch or it will be abandoned.** Roughly 6,000 line items a year from Woolworths alone means per-source `autoLinkPolicy`, and grocery never entering the review queue.
- **Fan-out is proposed, never automatic.** Unattended inventory or pantry creation from every durable-looking line item fills those pillars with cables and single-use ingredients, after which the user stops trusting them (POPS-245, POPS-246).
- **The pillar is not cheap.** A full pillar's infrastructure plus a reconciliation engine is the price of line items being available to every consumer on equal terms rather than through finance.
