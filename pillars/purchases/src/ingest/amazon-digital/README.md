# Amazon DSAR digital-orders adapter

Parses `Your Amazon Orders/Digital Content Orders.csv` and `Your Amazon Orders/Digital Returns.csv` from the Amazon "Request My Data" bundle into orders for `POST /purchases`. Ingest only — nothing here links, matches or sweeps.

Same download as the physical adapter next door, and a different feed in every way that matters: its own Order ID namespace, its own grain, its own settlement shape. The numbers below are measurements from a real 226-row Australian bundle rather than estimates.

## Why it is a separate source, not a widened parser

`purchase_sources.id` is `amazon-digital`, not `amazon`. Two properties force that.

**The Order IDs are a different namespace.** The bundle's 90 digital ids are all `D01-…`; its 748 physical ids are `NNN-NNNNNNN-NNNNNNN` across eight prefixes. Zero overlap — checked directly, not assumed. Feeding both through one source would merge nothing, because there is nothing to merge, and would put two independently-issued identifier spaces under one uniqueness constraint.

**A collision under one source is silent.** `(source, source_order_id)` is UNIQUE and `checksum` is unique globally. Under a shared source, a digital id equal to a physical one comes back from `POST /purchases` as a 409, which the backfill counts as "already had it" and prints as a skip. A whole order would go missing and the run would report success. Under separate sources the constraint does not apply across them, and the checksum recipe hashes the source id first so the two content hashes cannot collide either. `__tests__/namespace.test.ts` forces the case the bundle does not contain and asserts both halves.

Separate sources also buy the matching configuration this feed actually wants, which the physical one would be wrong to inherit:

- **A three-day settlement window** instead of the pillar's 21-day default. `Order Date` equals `Fulfilled Date` on all 90 orders — a digital purchase authorises and delivers in the same minute, so it settles 1:1 rather than as the shipment splits days apart the wide default exists to absorb.
- **No descriptor pattern at all.** 55 orders bill through `www.amazon.com.au` and 33 through `www.audible.com.au`, and one SQL LIKE cannot cover both. `AMAZON%` would look tighter and be worse: every Audible charge would be blocked at stage 0 and stay residual forever with nothing surfaced to a human. Declaring no pattern blocks nothing, so those orders match on amount and date and land in the review queue, which is where `autoLinkPolicy: 'review'` wants them.

## The grain, which is the whole problem

The CSV is **one row per monetary component of an order item**. `Component Type` is `Price Amount` or `Tax` — nothing else appears on any of the 226 rows — and `Transaction Amount` is that component's own money.

| grain     | key                                 | rows |
| --------- | ----------------------------------- | ---- |
| order     | `Order ID` — 90 of them             | 226  |
| item      | `(Order ID, Digital Order Item ID)` | 90   |
| component | the row                             | 226  |

Order and item are the same grain on this download: **one item per order on 90 of 90**. A digital order is one redemption. The parser groups on `(Order ID, Digital Order Item ID)` anyway rather than reading that as a rule — nothing in the file's shape forbids two items, and collapsing them would name the line after the first product while handing it both products' money, silently.

**`Transaction Amount` summed across an order is the only figure in the file that says what was charged.** `Price` states the list price, and on a credit-redeemed audiobook that is $14.95 against $0.00 actually paid. `Price Tax` is not the tax — it is the tax-inclusive price, equal to `Price` on 224 of 226 rows.

## The promotion pair

67 of the 90 orders carry two rows: one `Price Amount`, one `Tax`, both positive.

The other 23 carry four, as two signed pairs:

```
Price Amount   13.59   Offer Type Code: Not Applicable
Tax             1.36   Offer Type Code: Not Applicable
Price Amount  -13.59   Offer Type Code: Promotion
Tax            -1.36   Offer Type Code: Promotion
```

That is an Audible credit being redeemed. The order nets to **zero** and no money left the account. Reading `Price` instead of the components would invent $14.95 of spend on each of them — $343 of phantom card charges across the bundle, none of which any bank statement can ever settle.

Row order within an order is not fixed; the pairs interleave. Nothing here depends on it.

The four money fields come out of the components directly, and the last line of this is an identity rather than a measurement — `totalCents` is computed from the other three:

```
subtotalCents  = Σ positive Price Amount
taxCents       = Σ positive Tax
discountCents  = |Σ negative components, either type|
totalCents     = Σ all components  ==  subtotal + tax − discount
```

**A zero total is a real value**, which is why an order with any unreadable component is dropped rather than landed at zero: a parse failure that produced one would be indistinguishable from a promotion that cancelled the price. For the same reason a promotion-cancelled order carries the order tag `promotion-offset`. Without it, the 23 credit redemptions look exactly like the 5 genuinely free items, and "this cost nothing" loses the difference between a gift and a thing paid for with a credit. That tag reaches the database through `tags` on the create body — a field the contract did not carry until this adapter needed it, and a claim worth checking rather than assuming, since ts-rest hands the handler the zod-parsed body and `z.object()` discards an unknown key without complaining.

**A total below zero is not.** A promotion cancels a price to exactly zero; components that net negative say a merchant paid the account, which nothing in the file explains. Such an order is dropped rather than landed as negative spend in the merchant total.

## What it does not produce

**No shipments.** Nothing is delivered, nothing is carried and nothing can be tracked. The file states a `Delivery Date` and a `Delivery Packet ID`, and both are deliberately dropped rather than turned into a synthetic delivery — `purchase_shipments` exists for real boxes, and one fictional row in it costs more than the two fields are worth.

**No captures.** Same as the physical adapter: the export publishes no breakdown of what was _paid_, so every order lands `awaiting_settlement` with its full total residual until the reconciliation engine mints a derived charge for the transaction it matches. The 28 zero-total orders have no charges at all and never enter the reconcile queue, which is correct — no transaction of $0.00 will ever exist to match them.

**No inventory or pantry fan-out.** Every line is `kind: 'digital'`, asserted rather than proposed: the file _is_ the record of a digital purchase, so this transcribes the merchant instead of guessing, and a later classification pass must not overwrite it.

## Returns

`Digital Returns.csv` — 12 rows, 4 orders, all four joining. It lives beside the orders file under `Your Amazon Orders/`, **not** with the physical returns under `Your Returns & Refunds/`.

Its grain matches the orders file: one row per monetary component of a reversal, so a return is the **sum** of its rows and never one row's amount. That is why this is not a widened `amazon/refunds.ts`, which reads one stated amount per refund.

Two of the four reversals net positive and two net **zero** — the credit came back, not money, and the same promotion pair that cancelled the purchase cancels the return. Only a positive net becomes a charge.

Three gates, each stopping a different way of inventing money:

- **`Return Status` must be `Customer Return Complete`.** All 12 rows are, so gating changes nothing on this bundle. It is gated for the asymmetry the physical adapter names: ingesting a cancelled line loses nothing, whereas recording an unfinished reversal invents money coming back.
- **The net must be positive.** A zero-value refund charge would claim a disbursement no statement will ever carry.
- **`Amount Refunded` must agree with the net where it is stated.** It is a second, independent statement of the same figure — `19.23` and `2.99`, matching their components exactly on 2 of 2 — and where two readings disagree nothing in the file says which is right, so neither is used.

`Base Currency` is stated on exactly the rows that moved money and reads `Not Available` on the credit reversals, so the currency guard the physical adapter applies works unchanged here.

Every refusal is an anomaly, never silent: an unrecorded refund leaves the order reporting its full total as spent, which is indistinguishable from an order that was never returned.

## Running it

```bash
cd pillars/purchases && pnpm ingest:amazon-digital -- "<bundle-root>" --dry-run
```

`<bundle-root>` is the same directory `ingest:amazon` takes — the unzipped bundle's top folder, the one that _contains_ `Your Amazon Orders/`. Amazon names it `Your Orders`, so the path usually ends in it:

```bash
POPS_INTERNAL_API_KEY=<key> pnpm ingest:amazon-digital -- ~/Downloads/"Your Orders"
```

Its own command rather than a second phase of `ingest:amazon`, because it writes under its own source and one feed failing must not take the other down. A real run writes through `POST /purchases` and needs a key whose account grants `purchases.source` and `purchases.purchase`; `--dry-run` needs none.

A bundle from an account that never returned a digital purchase carries no `Digital Returns.csv`, and that absence is reported and tolerated. A file that exists and cannot be read is not, because proceeding would land every returned order at its full total.

Re-running is safe for the reasons the physical adapter's is: each order carries a content checksum over its rows _and_ its returns, and `(source, sourceOrderId)` is unique, so a second run reports every order as a skip. Neither guard _updates_ an order whose bundle has since gained a return.
