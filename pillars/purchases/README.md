# purchases

A bank transaction is an aggregate: `AMAZON MKTPLACE AU $412.80` records that money moved and nothing about what was bought. This pillar owns the other half — the order, its deliveries, its line items, and the charges that paid for it. The reasoning, the alternatives, and why this is a pillar rather than a finance module are in [ADR-042](../../docs/architecture/adr-042-purchase-documents-and-transaction-reconciliation.md).

Port 3013, `purchases.db`, registers itself with `registry` on boot.

## The shape

An **order** is the single point of entry. Five flat lists hang off it — plus one row, at most, recording when and where an uploaded receipt was photographed — and the cross-references between those lists are all optional:

```
purchases  (the order)
  ├─ purchase_shipments             every delivery
  ├─ purchase_items                 every line, complete
  │    ├─ purchase_item_units       per-unit identity → inventory
  │    ├─ purchase_item_tags        POPS classification, proposed or asserted
  │    └─ purchase_item_notes       verbatim merchant prose, ordered
  ├─ purchase_charges               every charge, matched or not
  │    ├─ purchase_charge_links     charge → finance transaction
  │    ├─ purchase_link_rejections  pairings a human ruled out
  │    └─ purchase_item_allocations which charge paid for which line
  ├─ purchase_tags                  facts about the order that aren't fields
  ├─ purchase_documents             evidence → documents
  └─ purchase_capture               when and where it was photographed

purchase_products                   a product a human recognises
  └─ purchase_product_aliases       one printed wording that resolves to it
```

Two tables sit outside that tree. They are not facts about one order: they are the learned dictionary that gives a printed line a durable product identity, for the sources that state no identifier of their own.

Four grains, because real purchase data has four and collapsing any of them loses information that cannot be recovered. One Amazon order ships in three boxes and settles as two card charges. One AliExpress order trickles in over two months. A quantity-3 line becomes three inventory records with three serial numbers.

## Two things that are load-bearing

**A charge does not depend on finance.** `purchase_charges` records what the merchant says was charged; `purchase_charge_links` attaches a `pops://finance/transaction/<id>` once one is imported. The weeks between "Amazon charged the card" and "the statement was imported" are a represented state, not a gap. An earlier draft made a charge _be_ the link, which meant a perfectly normal order looked unexplained for a month.

**Charge grouping is not assumed to equal delivery grouping.** Amazon sometimes charges per product group rather than per box, and whether AliExpress's purchase-time groupings map to deliveries is unverified. So a charge belongs to the _order_ — always correct — and names a shipment only when the evidence supports it. No "charge block" entity has been invented on a guess. If blocks do turn out to equal deliveries, that will show up as `purchase_charges.shipment_id` being reliably populated, and the entity can be introduced then with real data behind it.

## Both directions of the link

`GET /purchases/:id` reads the relationship forwards, from an order to the transactions backing each of its charges. `GET /reconcile/links?transactionUri=…` reads it backwards, and that is the direction a person actually arrives from: you are looking at `AMAZON MKTPLACE AU $412.80` in finance and want to know what it bought.

It returns a list of orders, not one. A combined settlement — several charges, one transaction — is a phase of the matching ladder rather than an anomaly, so an answer shaped as "the purchase" would silently drop spend the transaction on screen really did pay for. Each entry carries the charges involved, the link rows themselves, and `linkedCents`, that order's share of the transaction.

**`GET /reconcile/queue` is not a substitute, and looks like one.** The queue answers "what still wants a decision": confirming a link is what removes its charge from it, and an auto-link source never enters it at all. Both of those are established links and are exactly what a finance view is asking about, so a lookup built by scanning the queue reports "no purchase" for the two states where the relationship is most certain. The reverse lookup indexes `purchase_charge_links` directly and reports each link's `confirmedAt` rather than filtering on it — a consumer that renders a derived link as a settled fact is reporting the engine's guess.

A transaction no order explains is an empty list and a `200`. That is the ordinary case for most of a statement, and a `404` would have consumers treating "this was not a purchase" as a fault.

### The plural form, for a list rather than a panel

`POST /reconcile/links/batch` takes up to 500 transaction URIs and answers each with counts: how many distinct orders explain it, how many of those links a human confirmed, and how many the matcher merely derived. A transactions table drawing "does an order explain this row" over a page of fifty rows would otherwise call the singular route fifty times, which is why no such column existed.

It is a `POST` that mutates nothing. Five hundred URIs is roughly twenty-five kilobytes of query string, past what proxies reliably accept, and a URL truncated in transit fails as a wrong answer rather than as an error — so the keys travel in the body.

It **counts, and returns no orders and no money**. Returning the orders would make it a second, fuller answer to the question the singular route already answers, free to drift from it; a consumer that wants the orders opens the one transaction it is asking about. Money is absent for the reason the merchant roll-up refuses a grand total: a charge's currency is the settlement currency, one transaction can settle orders in more than one, and a single `linkedCents` here would be a cross-currency sum wearing a currency's clothes.

The two counts stay apart for the reason `confirmedAt` exists at all. A single "has a purchase" flag would report the matcher's current belief — which a later sweep may withdraw — as a decision somebody made, on every row it drew. Both non-zero is a partly-decided transaction, which is a real state rather than a rounding of either.

A requested URI **absent** from the answer means no order explains it. Echoing every URI back with zeroes would make the response proportional to the question rather than to the answer, on a surface where most of the question is misses. The 500 is the route's bound, and it binds tighter than a `limit` would: the answer is at most one fixed-size row per URI asked about, so a caller that can count its own request already knows the size of the response, and there is nothing for an `offset` to page over.

## The accounting split

`GET /purchases/:id` returns the split pre-computed, because each number calls for something different and deriving them per consumer is how three frontends end up disagreeing:

|                       | meaning                                                           | action           |
| --------------------- | ----------------------------------------------------------------- | ---------------- |
| `matchedCents`        | charged, and a finance transaction backs it                       | none             |
| `awaitingImportCents` | charged, no transaction yet                                       | wait             |
| `residualCents`       | no charge accounts for it — gift card, rewards, or a genuine miss | a human looks    |
| `refundedCents`       | money returned, as a positive magnitude                           | none             |
| `netSpendCents`       | `total − refunded`                                                | the headline one |

The identity to rely on: `totalCents === matchedCents + awaitingImportCents + residualCents`, with `refundedCents` orthogonal to it.

`netSpendCents` answers what the order **cost**, not how much of it has been proven. It is the merchant's own total less what came back, so it does not move when a statement imports or when the sweep mints a derived capture — a merchant headline that changed because a cron ran would be reporting import history rather than spending. It also keeps gift-card and rewards money, which is spent money no bank transaction will ever show. Summed for a merchant it stays additive: `Σtotal − Σrefunded`. "Money we can prove moved, net of refunds" is still there for any consumer that wants it, as `matched + awaitingImport − refunded`. Like the residual it is never clamped: negative means refunds exceeded the order total, which is a real over-refund.

Folding `awaitingImport` into the residual would flag every recent order as broken until its statement imports — the false alarm that teaches someone to ignore the number. Folding **refunds** in is worse, and an earlier version did: a fully-paid order with an $11.79 refund reported an $11.79 residual, presenting returned money as missing money, so receiving a refund made the "something is wrong" number go _up_. A property test now asserts a refund can never increase the residual.

`residualCents` is never clamped: a negative value means over-charging, which is a bug worth seeing.

`authorization` charges are excluded from all of it. A card hold and its capture are two records of one payment, and counting both makes a correctly-settled order look doubly paid.

## The aggregate surface

Two routes, at two grains. Everything else is a row reader, and neither headline can be assembled from row readers: `GET /purchases` pages at 500 and returns no charge-link state, and `GET /items` cannot enumerate without a `tag`.

### `GET /analytics/merchant-spend` — the order grain

It answers one question — what was spent per merchant over a period, and how much of it is explained — and returns the same six figures the per-order split does, summed. `residualCents` is in the response rather than derived by the caller: a consumer that has to compute the unexplained bucket is a consumer that can forget to, and a view which drops it turns a known unknown into a false certainty.

Two things it deliberately does not do:

- **It does not add currencies together.** Groups are keyed on merchant _and_ currency, and `totals` carries one entry per currency rather than one grand total. There is no meaningful sum across currencies, and returning one would look authoritative.
- **It takes no `limit`.** A roll-up over the first 500 of 748 orders is not a smaller answer, it is a wrong one, and nothing in the response would say which it was. The period is the only bound.

Merchant attribution is reported three ways, because the pillar has two different things called a merchant: `entity` (grouped on a resolved `contacts` entity id, the operative identity), `name` (grouped on the label, because no entity was ever attached), and `unattributed` (the order names no merchant). Today every export-ingested order lands under `name` — no export adapter sets an id, only receipt ingest does (POPS-1852). Collapsing the three would report a string match as an identity, and orders naming no merchant would vanish from a total that claims to describe them.

**A group can be opened.** `GET /purchases` takes the same three — `merchantEntityId`, `merchantEntityName`, `merchantUnattributed` — plus `currency`, off the same scope vocabulary the roll-up derives its own query from, so the same parameters select the same orders in both. A row saying "Bunnings, 12 orders, $1,041.20 of which $151.20 is unexplained" is where a reader forms the question `GET /purchases/:id` answers, and naming an unexplained figure nobody can then chase is a weaker version of hiding it.

The three are exclusive, and `name` is the one that has to be spelled carefully. A `name` group holds exactly the orders that resolved to no entity, so the filter matches the label **and** a null entity id; matching the label alone would sweep in every order that did resolve to an entity wearing that label, and the list would hold more orders than the row it was opened from counted. Two parameters at once is a 400 rather than an intersection: `merchantEntityId` and `merchantEntityName` together denote no group the roll-up produces, and the intersection is empty by construction.

The fold reuses `computeAccounting` per order rather than restating the split as `SUM()` in SQL, so the residual keeps exactly one implementation. That is also why the arithmetic happens after the rows are re-grouped and not in the database: an order with three charges appears three times in a charge join and six times once links are joined, and a database-side `SUM(total_cents)` would report six times what was spent.

### `GET /analytics/product-leaderboard` — the product grain

The same thing bought across N orders: per product, how many distinct orders hold it, how many lines and units, first and last purchase, how often it comes back, what one of it has cost each time, summed landed cost, and every merchant it was bought from. Landed cost reuses `landedCostCents` per line rather than restating `lineTotal + allocatedShipping + allocatedAdjustment` in SQL, on the same single-implementation rule the residual follows. Nothing here joins charges or links, which is what makes "how many orders" a count of distinct order ids rather than a figure that multiplies by however many charges settled them.

**Grouping is the hard part.** A group is formed on one of four bases, and which one travels with the group:

- `sku` — the merchant's own identifier. The only basis a source asserts, and exactly one shipped adapter writes one (`sku: readText(row['ASIN'])` in the Amazon mapper). Within Amazon, repeats group perfectly.
- `product` — a [dictionary](#the-product-dictionary) entry claimed the printed wording. Carries `confirmed`, because an entry a human asserted is evidence and an entry a pass minted is the `name` proposal with an id attached. A row reads `confirmed` only where **every** wording in the group was asserted: one unasserted wording is lines the group holds on a pass's proposal, and half a merge presented as a fact is the error this whole route is arranged against.
- `name` — printed names that normalise alike, within one merchant, with no dictionary entry between them. A **proposal**: it merges two products a till abbreviates the same way, and splits one product printed two ways.
- `unidentified` — no sku and no name that normalises to anything. Groups with nothing, one line per row, because a bucket every nameless line falls into would report a whole shop as one product.

A group never spans merchants a source did not put together. `receipt` is one source id for every shop a user photographs, so a key on the source alone would fold two cafes' `LATTE` lines into one product with one summed cost; the key is confined to the order's merchant unless the source is a single merchant's own feed, which is what keeps a Woolworths product grouped across the chain's stores instead of splitting per branch. `merchants` on a row is therefore the group's scope, not just a list of where it was seen. The one thing that reaches across that boundary is a person pointing two scoped wordings at one dictionary product, which is deliberate and is the only way a `product` row comes to list merchants a source never put together.

The rule is `identifyProduct` in `src/db/services/product-identity.ts`, shared with the classification pass so a decision the pass made about a product and a row this route shows for it describe the same lines.

`coverage` says exactly that per request — lines in scope split across the bases, plus the product count — so a consumer can see how much of the answer rests on a proposal before it renders a row. The two dictionary figures are counted apart for the same reason the bases are. It is computed over the whole scope, before any withholding.

`minOrderCount` is the N. It is not a page cap: it selects on the answer's own defining property, is stated by the caller, and is echoed in the response, so a group that is absent is absent for a reason the payload names. There is still no `limit`, for the reason the merchant roll-up has none. Currency is part of the grouping key here too.

**Cadence** is on every row: the median gap between consecutive purchases, the mean, and the two extremes, in seconds. Measured between **distinct orders** rather than lines, so two bags of the same coffee in one basket are one purchase and not an instant re-buy. A product bought once carries `{ "basis": "single-purchase" }` and no figures at all — a zero would render as "bought again immediately", which is the opposite of what it means, and a null invites a consumer to draw an empty cadence beside a real one. The median leads because a bursty history's mean describes a rhythm nothing ever happened at; the mean is returned beside it precisely so the distance between the two is visible. Nothing is relative to now: "due for a re-buy" needs a clock, and a read that consulted one would answer differently to two calls a minute apart.

**Unit-price history** is on every row too, and it is four observations rather than a drift figure. `firstCents` → `lastCents` is the drift and `minCents` / `maxCents` say whether those two ends represent the series; a single percentage would be the one number a consumer renders and would hide every case where they do not — a product whose last purchase happened to be on special reads as a permanent price cut. The series is built on `purchase_items.unit_price_cents`, the merchant's price for one, and deliberately **not** on landed cost: allocated shipping and adjustment are shares of an order-level figure spread over that order's lines, so the same product bought alone and bought inside a twenty-line order carries wildly different allocations, and a per-unit series built on landed cost moves with the shape of the basket rather than with the price.

Three counts qualify it, each a fact off a column rather than an inference:

- `promotionalLineCount` / `ordinaryLineCount` / `unstatedPromotionLineCount` — the `^` marker, three-way on the rule the residual follows. Only the Woolworths receipt states it either way, so folding "nobody said" into "ordinary" would assert a price the merchant never characterised.
- `measuredLineCount` — lines priced by measure (`0.202 kg NET @ $2.90/kg`), which fruit, veg and the deli counter all are. Such a line carries a quantity of 1 and a unit price equal to what that weight cost, so 0.5 kg of bananas against 1.2 kg reads as a 140% rise with nothing else on the row to say otherwise. It is recognised from the merchant prose the adapters store verbatim (`src/ingest/measure-notes.ts`, shared with the Woolworths grouper that writes it), which is best-effort and wrong in both directions — a wording it has not met is read as a count, and a genuine per-each price (`1 ea @ $5.00`) is read as a measure. Neither moves a figure: nothing derives a price from the answer, so a miss leaves the caveat unstated and a false positive states one that was not needed. A structured flag on the line, set at ingest, is POPS-2389.

Everything a group says about its own ends — both dates, the label it wears, the merchant it is attributed to, both ends of the price series — is ordered by the **parsed instant** rather than by the timestamp text, so an order stamped `2026-01-02T00:00:00+10:00` correctly precedes one stamped `2026-01-01T20:00:00Z`. Text ordering puts those two the wrong way round and leaves a row whose endpoints disagree with its own cadence. `src/db/services/order-rank.ts` is the one notion of that ordering, shared with the merchant roll-up's label ranking rather than restated beside it. The `from` / `to` window that decides which orders are in scope at all is still a text comparison in SQL (POPS-2070), so the same offset that these folds now order correctly can still put an order on the wrong side of a period boundary.

**What POPS-244 still needs on top of these**, none of which these routes provide:

- the consumable-vs-durable kind split (POPS-1850). Its substrate now exists — `kind` and `kindConfirmedAt` — so it must be **three** numbers, confirmed-consumable, confirmed-durable and unreviewed, mirroring `matched` / `awaitingImport` / `residual`. A two-way percentage would report a classification pass's proposal as a finding;
- tag counterfactuals such as "cut all `snack` line items" (POPS-1851). Item tags now carry their own `confirmedAt`, so the same three-way rule applies — but they are still drawn from whatever a classification pass proposed rather than being guaranteed finance `tag_vocabulary` slugs, and a counterfactual is only as meaningful as the vocabulary it groups on;
- **regret detection, which the pillar cannot yet support at all** (POPS-2388). The ticket's design is line item → `pops://inventory/item/<id>` → `home_inventory.in_use = 0`, and the chain is only half built: an accepted proposal now creates the asset and writes `purchase_item_units.inventory_item_uri`, but no shipped adapter states one and no surface yet offers the accept to a human (POPS-2357), so in practice the column fills only for orders someone answers by hand. Even with the chain complete, `home_inventory.in_use` is a nullable tri-state with no date on it — NULL on every row nobody has reviewed — so `in_use = 0` cannot distinguish a thing retired after five years of use from one never taken out of its box, and a leaderboard row reading "you regret this" off it would be a confident falsehood about the most personal number in the pillar. **The fan-out has made that worse rather than better**: inventory's create body cannot express the NULL, so every asset this pillar creates lands on `in_use = 0` unreviewed, which is precisely the value the design meant to read (POPS-2432). The honest answer is that this waits for the fan-out, for a create that can say "unreviewed", and for a signal that carries a date.

## The product dictionary

A supermarket receipt says `CHK BRST 1KG`; an invoice for the same thing says `Chicken Breast 1kg`. Two of the three shipped adapters state no product identifier at all — a Woolworths receipt row is `{prefixChar, description, amount}`, and the receipt extraction schema refuses inferred identifiers by design — so for those lines a printed wording is the only evidence of identity there is. `purchase_products` and `purchase_product_aliases` are where that evidence is written down. Service in `src/db/services/product-dictionary.ts`, routes under `/products`.

**What it learns from.** Two things:

1. _Repetition._ `POST /products/proposals` scans every stored line, and mints one entry per distinct scoped printed wording, pointing at a product of its own. That is not a guess — it is the grouping the aggregates already do, written down so a human can point at it.
2. _Assertion._ `PATCH /products/aliases/:aliasId` with a `productId` points one wording at another wording's product. From then on both resolve to it, for every line already stored and every line that arrives later, without anyone being asked again. That is the mapping being learned, and it is learned once.

**What it will not attempt.** It will not infer that `CHK BRST 1KG` and `Chicken Breast 1kg` are the same thing. Nothing in this pillar's data says they are: the merchants state no identifier, the prices differ, and the only available signal is string similarity — which is exactly the signal that cannot tell `MILK 1L` from `MILK 2L`. Two products collapsing into one corrupts spend attribution in a way no later reader can see, where leaving them apart is a visible non-answer. So the lookup is **exact on the normalised name**: no prefix, no substring, no edit distance. Finance's `entity-matcher.ts` can afford those stages because a bank descriptor's noise is its _suffix_; a product name's discriminating tokens are its suffix, and inverting that assumption is how the invisible error gets made.

**Two rules keep an entry from reaching further than its evidence.** The dictionary is never consulted for a line that states a sku, so a minted identity can never absorb an ASIN-keyed group — Amazon is out of scope here and loses nothing by it. And an entry is scoped by the same `productScopeKey` the on-the-fly grouping uses, so two cafés printing `LATTE` get two entries under the `receipt` source while a Woolworths wording still reaches the whole chain. The one thing that crosses a scope boundary is a human pointing two entries at one product, which is the feature.

**How a bad entry is undone.** Every write is reversible and none of them touches a line:

| the mistake          | the undo                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| a wrong merge        | `PATCH /products/aliases/:id` with `productId: null` — mints the wording a product of its own again |
| a wrong confirmation | the same route with `confirmed: false` — back to a proposal a pass may retire                       |
| a wrong entry        | `DELETE /products/aliases/:id` — the lines fall back to the on-the-fly `name` grouping              |
| a wrong product      | `DELETE /products/:id` — takes every wording with it                                                |

A product left with no wordings is deleted in the same write: a product nothing resolves to is a label no read path can reach, and one a caller could still confirm and rename.

**The grain is the wording, not the line**, which buys the dictionary its main property — a mapping is stated once and applies to every line that ever prints that wording, past or future, with no backfill — and costs it one: two genuinely different products that a merchant prints _identically_ cannot be told apart here, because there is nothing but the wording to tell them apart with. That is the `name` basis's existing limitation carried forward rather than a new one, and it is the same trade the rest of this section argues for: a visible non-answer over an invisible wrong one.

**`confirmedAt` is the whole boundary between a pass and a person**, the same idiom `purchase_item_tags` and `purchase_items.kindConfirmedAt` carry. Null means the proposal pass owns the row — it may retire the entry once no line prints that wording. Non-null means a human asserted it, and the pass may not retire, repoint or relabel it, even when the line that prompted it has been deleted. The pass runs over **every** line with no scope filter, deliberately: deriving the dictionary from a window would retire entries whose lines merely fell outside it.

**A database that never runs the pass behaves exactly as it did before this existed** — an on-the-fly group per normalised name, resolved fresh on every read. Nothing is backfilled and no ingest path writes here.

**Running the pass is a command, and it previews by default.** `pnpm -F @pops/purchases propose:products` runs the real pass inside a transaction it then rolls back, and prints the counts plus a sample of the wordings it would mint and retire and of the renamed products those retirements would take with them. It leaves the dictionary exactly as it found it — opening the file still applies any pending migration, as every command here does. `-- --write` runs the same pass and commits it; that is a second scan of whatever the lines say by then, so a database still being ingested into can legitimately answer the two runs differently. Like `propose:kinds` it goes at the SQLite file rather than over HTTP, so it needs no base URL and no service-account key — and unlike it, this pass calls no model, so a preview costs a scan and nothing else. The preview is the default here and not there because this pass deletes: it retires the unconfirmed entries no line prints any more, where the kind pass only ever fills a NULL. `POST /products/proposals` is still the other way in, and still writes immediately.

**Nothing runs the pass on a schedule, and that is a decision rather than an omission.** The pass is idempotent and reads every line by design, and it will not retire, repoint or relabel a confirmed entry — though the marker is on the wording and not on the product, so a product a human renamed is deleted with its last unconfirmed wording either way (POPS-2431). What the pass produces is a review queue, and no surface shows that queue (POPS-2392). A nightly run would mint entries nobody can see or correct, and would move every eligible leaderboard row off the honest `name` basis onto an unconfirmed `product` one on every deployment, without anyone having asked for a dictionary at all. So it stays on demand, where the preview can put the deletions in front of someone before they happen; POPS-2416 revisits it once the corrections have a home.

## Other invariants that span files

**All money is integer cents.** `CentsSchema` is `z.int()`, so a float is a validation error rather than a silent rounding. Not stylistic: stage 2 of the reconciliation ladder is subset-sum, which is exact over integers and is not exact over anything else.

**A charge carries two amounts.** `amountCents` is in the settlement currency — what moved on the card, and what the matcher compares against finance transactions. `orderAmountCents` is the same money in the order's currency, which is what the residual is computed in. For a USD AliExpress order settling in AUD they differ; for everything else they are equal, stored anyway so the residual never branches.

**`totalCents` is not constrained to the sum of its components.** Profiling the real Amazon DSAR export found `subtotal + shipping + tax − discount` holding on 926 of 943 rows; the rest drift by cents on older orders. A CHECK on the identity would reject valid orders at ingest, so adapters record the order and route the mismatch to review. Component non-negativity _is_ enforced.

**An identifier is never handed over without its namespace.** `purchase_items.sku` holds what a source stated about _which product_ a line is, and a bare identifier is not an identity: an ASIN and a store's own article number are both strings, and joining lines on the string alone merges two products that collide by accident. So the column is a pair — `sku` with `skuScheme` — fused into one object on the wire for the same reason `kind` is. `asin` means the same product wherever it appears; `merchant` means nothing outside the source that issued it. NULL means the source named no product, which is every shipped adapter but the two Amazon exports, and two NULLs are not a match. See `src/ingest/README.md` under "Naming a product".

**A classification is never handed over without its provenance.** No source states what a thing is, so `purchase_items.kind` and the item tags are POPS judgements — part machine proposal, part human decision. `kindConfirmedAt` and a tag row's `confirmedAt` are what separate the two: null means a classification pass proposed it and a re-run may reconsider, non-null means it was asserted and nothing may re-derive it. On the wire `kind` is one object carrying its own marker rather than two sibling fields, because two fields leave "read the pair" a convention and a consumer that ignores it reports a guess as a fact.

A proposal runs out of band — `pnpm propose:kinds`, never inside an adapter, so ingest needs no API key — and only ever fills a NULL. Confirming is `PATCH /purchases/:id/items/:itemId`, the pillar's only item-level mutation. To re-propose after a better model, clear the proposals first: `UPDATE purchase_items SET kind = NULL WHERE kind_confirmed_at IS NULL`, which by construction cannot reach a decision.

**Item tags are purchases' vocabulary, not finance's.** `fruit` and `healthy` describe a product; finance's `tag_vocabulary` holds `Groceries` and `Eat Out`, which describe a payment. Different grains, so a tag written here is never validated against finance and never rolled up into it. The vocabulary is open — adding one is a write, not a deploy — and only its shape is closed, to lower-case slugs, because `Fruit` and `fruit` becoming two tags is exactly the drift finance's Title Case labels already carry.

**`position` is not cosmetic.** Ids are random UUIDs and every row written in one ingest shares a `createdAt` to the second, so without an explicit position the read order of lines, deliveries and charges is genuinely non-deterministic — a 100-line grocery receipt would render shuffled, and the deterministic candidate ordering the reconciliation engine needs for re-derivation to be safe would not hold.

**`merchantEntityId` is operative; `merchantEntityName` is only its label.** Entities live in `contacts` and are read live, and no mirror table exists — the same invariant finance carries on `transaction_corrections` (`pillars/finance/src/db/schema/corrections.ts`). Receipt ingest resolves a merchant name against `contacts` once, at write time, and stores the id it got back; no read path resolves by name. **Export ingest resolves nothing**, so the operative column is null for the whole Amazon bundle and the spend roll-up groups those orders by label, reporting `resolution: 'name'` rather than claiming an identity they do not have (POPS-1852).

**`finance` has no idea this pillar exists.** No foreign key crosses the boundary and no schema change was made on the finance side, which is what lets the two be migrated and restored independently.

**Closed vocabularies are CHECK-backed.** Every enum in `src/contract/constants.ts` has a matching CHECK in the migration. `purchase_sources` is the deliberate exception: merchants are rows, so registering Bunnings is an insert, not a deploy.

## Two states that look like errors and are not

An order with **no charge and no link** (`awaiting_settlement`) is normal and permanent. A receipt captured in October is correct in October whether or not the card that paid for it is imported in December.

A **cash** order (`settlementMode='cash'`) is terminal on arrival — `createPurchase` writes it straight to `settled_cash`. No transaction will ever exist for it, so it must never enter the reconcile queue, while still counting in every spend figure.

## Evidence that arrives after the order

An order's documents travel in its create request, and for a photographed receipt that is the whole story. For an export bundle it is not: the Amazon DSAR bundle's 325 tax invoices sit in a different folder than its order history, they carry no order id in their filenames, and the history is what gets ingested first. By the time the invoices are read the orders are already here, and `POST /purchases` refuses each of them at the checksum — so the create path can never place them.

`POST /purchases/:id/documents` is the way in. One document, addressed by the order's own id, which is the only handle an already-ingested order answers to. `uq_purchase_documents(purchase_id, document_uri)` makes a repeat a `409` rather than a second row, so a backfill can be re-run without checking first: `pnpm ingest:amazon -- "<bundle>" --attach-existing` resolves each merchant order id against `GET /purchases?sources=amazon` and posts what is missing, and a second run reports every invoice as already carried. The route carries no shipment, because the adapter-local `shipmentRef` a create call uses resolves against deliveries defined in the same payload and there are none here — a document belonging to one delivery rather than the whole order can still only be attached at ingest (POPS-2418).

Keep it small. [ADR-042](../../docs/architecture/adr-042-purchase-documents-and-transaction-reconciliation.md) and POPS-1528 migrate purchase evidence to the `documents` pillar, and this route migrates with it.

## The inventory fan-out

A durable line suggests an asset. `GET /purchases/:id/inventory-proposals` is that suggestion and nothing more: **it creates nothing, and nothing here fans out on its own**. Unattended fan-out fills that pillar with cables, batteries and light globes inside a month, at which point the user stops trusting it — which is why `ITEM_KINDS` calls both fan-out directions proposals. An asset is only ever created by a human answering one offer, and then by exactly one of the two routes below.

**What makes a proposal** is a unit slot, not a line. `purchase_items.kind = 'durable'` is the substrate and nothing here re-derives durability from a name; a quantity-3 durable line is up to three assets with three warranties, so it yields three offers answered one at a time. Two exclusions beyond the kind are load-bearing rather than fussy: a line on a `cancelled` or `returned` delivery is goods that never arrived, and a fully refunded line is goods that went back. A _partial_ refund kept the goods and gave some money back, so the line still proposes — priced net of what came back.

The payload borrows inventory's field names where that pillar has a counterpart — `itemName`, `purchaseDate`, `purchasedFromName`. **Four fields do not cross unchanged**, and a caller creating the row itself needs that before assuming a straight copy works — `src/api/inventory/asset.ts` is what the server-side route does about each:

| field                    | what happens on the other side                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `purchasePriceCents`     | inventory's `purchasePrice` is a float dollar amount; this pillar mints no float anywhere, so dividing by 100 is the accepting caller's step                                                                                   |
| `purchaseDate`           | an ISO instant here; a calendar day there. Inventory's edit form binds that column to an `<input type="date">`, which cannot hold a timestamp — it shows blank and writes `null` back on the next save of any field on the row |
| `purchaseTransactionUri` | inventory's `POST /items` takes a bare `purchaseTransactionId`, and `home_inventory.purchase_transaction_uri` has no REST writer at all — posted as-is, the key is silently stripped by zod (POPS-1526)                        |
| `serialNumber`           | inventory has no such column anywhere (POPS-2386)                                                                                                                                                                              |

The last two are carried anyway: they are the strongest facts purchases holds about the asset, and a field withheld until its reader exists is a field nobody builds the reader for. The server-side route does the arithmetic, takes the bare transaction id out of the URI — and only out of a `finance`/`transaction` one, since that column means a finance transaction and splitting any URI on its last slash would file a documents id there — and puts the serial number in the row's `notes` as prose. Prose because it is visibly not a field, so nothing can mistake it for the column inventory does not have, and because the alternative is dropping the asset's strongest identity on the floor until POPS-2386 lands.

`purchaseDate` is truncated to `yyyy-mm-dd` **in the household timezone**, not in UTC: a Sydney evening purchase is the next day in UTC, and the truncation is the point at which that becomes permanent. The instant stays in `purchases` — this is the accepting side losing precision it cannot store, which is the same shape as the division above and the opposite of the shape it looks like. Sending the instant instead would not preserve the time; it would delete the date the first time a person edited the row.

Two fields the payload does not carry are also stated rather than left to inventory's defaults, because a default in another pillar's contract is a fact about the asset that nothing here would notice changing. `inUse` and `deductible` both go as `false`: purchases holds no evidence either way, and `true` would assert a claim nobody made. **`inUse: false` is not "unreviewed"** — `home_inventory.in_use` is a nullable tri-state whose `NULL` means nobody has looked, inventory's create body has no way to send it, and `0` is the value regret detection was going to read. So every fanned-out asset arrives carrying the regret value without anyone having reviewed it, and POPS-2388 cannot read `in_use = 0` as regret until POPS-2432 gives the create body a way to say "unreviewed". The leaderboard bullet on regret detection says the same thing from the other end.

The price is the unit's share of **landed cost less anything refunded on the line**, apportioned by `allocateProRata` so a line's shares sum to that figure exactly. The sticker price of a thing is not what it cost to get it into the house, and money that came back is not part of what it cost either — `accounting.ts` derives `netSpendCents` at the order level for the same reason it is derived here rather than left to each consumer.

`purchaseTransactionUri` is filled only when exactly one **confirmed** link on a charge that **paid for the goods** names one, and all three halves matter. An unconfirmed link is the matcher's current guess, which the next sweep is free to tear down; an order paid across two transactions has no single one to name, and inventory's column holds one URI, so guessing would file the asset against half its own payment. A `refund` charge and an `authorization` charge are transactions of the order without being payments for it, so neither counts as that second one — otherwise a partially refunded order, or one whose bank recorded the card hold as its own row, would lose the link entirely, and those are exactly the orders most likely to carry a durable asset. Same pair `accounting.ts` excludes. Two other fields the ticket asked for are deliberately absent rather than null: purchases holds no `brand` and no `model` — no column, no source that states one — and splitting them out of a line name is guessing where a wrong answer is invisible afterwards (POPS-2355).

**Who accepts is a human, per item, and there are two ways to say yes.** `POST /purchases/:id/items/:itemId/inventory-proposal` records an answer about a row that already exists: `accepted` carries the `pops://inventory/item/<id>` URI of a row the caller **has already created** on the inventory pillar, and `declined` records the refusal. Recording an accept before the inventory row exists would store a reference to nothing, which the nightly cron would then dutifully mark stale. Only an `inventory`/`item` URI is accepted: the column is resolved by one cron leg that marks anything else a bad URI forever, and since a decision cannot be retracted a mistyped `pops://finance/transaction/...` would be permanent. The review UI that collects the opt-in is still outside this pillar (POPS-2357).

**`POST /purchases/:id/items/:itemId/inventory-item` is the other way, and it is this pillar writing into another one's data.** It asks the projection for the offer, creates the asset on inventory, then records the accept against the URI that came back — the whole fan-out in one call, for a caller that holds a human's consent and no inventory row.

The reason it is server-side rather than the browser's job is **the order those three steps happen in**. Whether a slot may still be answered is a fact in this pillar's own tables, and the browser cannot consult it before creating at all: it creates first and finds out afterwards, so every accept of an already-answered slot mints a duplicate, and its only remedy is to delete a row it just wrote in someone else's pillar. Here the check is this pillar's own read and it immediately precedes the create, so a slot answered at any point before the request arrives costs nothing — the common case, since the thing that answers a slot is usually a person, minutes or days earlier.

**That narrows the duplicate window; it does not close it, and no wording here should suggest otherwise.** Step 2 is a network call, so two accepts of the same slot in flight together both see it offered and both create. One records; the other is answered `ACCEPT_NOT_RECORDED` and hands back the URI of an asset nothing references. There is no repair on this side — a decision cannot be retracted, and inventory has no create keyed on where a row came from, so nothing here can ask for "the asset for this line, if it already exists". That key is exactly what makes the equivalent leg in food safe to retry: `send-to-list/lists-client.ts` writes into `lists` with `items.upsertByRef`, and the merge-or-insert is atomic per item on the receiving side. An idempotent create on inventory keyed on order and line would do the same here, and is the thing to build if the duplicate ever turns up in practice.

**The cost is that purchases can now write into inventory, and the grant cannot record that.** Scopes match by dot prefix, so the `inventory.items` this pillar already carried for the cron's `items.get` authorises `items.create`, `items.update` and `items.delete` as well. The capability predates this route; no scope exists that says "read items, write none", so nothing in the registry changes when the leg lands and no audit of the grant would show it. That is why the leg is written down instead — in the outbound table below, in `src/api/pillars/service-account.ts`, and at the top of `src/api/inventory/client.ts` — and why the code never treats the grant as a guarantee: a refusal is its own outcome, reported by name and logged with the account, exactly as the read legs report theirs. What is missing is a scope model that can express the difference (POPS-2420).

The write is also **attributable**, which a browser create would not be: the row's `notes` name the order and the line it came from, so an asset purchases minted can be told from one a person typed in, and traced back to `GET /purchases/:id`.

**Every failure is named rather than swallowed.** `502` with `INVENTORY_UNAUTHORIZED`, `INVENTORY_UNAVAILABLE` or `INVENTORY_REFUSED` means nothing was created and the offer still stands; `INVENTORY_RESPONSE_UNREADABLE` means inventory answered success without an id, so a row may exist that purchases cannot name and answering the offer again could duplicate it. The one that leaves a real asset behind is `ACCEPT_NOT_RECORDED`: the slot was answered by someone else while the create was in flight, so the asset exists and nothing references it. That response carries the URI, because a decision cannot be retracted and there is no mechanical repair — a person decides whether to delete it in inventory or keep it. Repeating the request would create a second one.

**Answer a proposal with the `unitId` it came with.** A proposal for a unit that already has a row carries that row's id, and it is the only thing telling two offers on the same line apart — one of them may be the unit whose serial number the source stated. An answer that names no `unitId` is an answer to a proposal whose `unitId` was `null`, so it mints the row rather than landing on an existing one; a line that already has a row for every unit it claims has no such proposal left and refuses an unnamed answer with a `409`. Folding an unnamed answer onto the oldest undecided row instead would record the human's decision against a different physical thing than the one they were shown.

**What stops a line proposing twice** is that a decided slot is not offered. `purchase_item_units.inventory_item_uri` says the unit is in inventory; `inventory_declined_at` says it was offered and turned down; a CHECK holds them mutually exclusive so no reader has to invent a precedence rule. A decision on a line with no undecided slot left is a `409`, not a silent extra unit — that is what stops a double-submitted accept putting two assets in inventory for one physical thing. There is no way to retract a decision (POPS-2358).

A stale link is **not** a re-opened proposal. `inventory_item_stale_at` means the nightly cron got a genuine 404 from inventory for that URI; it is evidence to show a human, and re-offering an asset they deleted on purpose would fight them.

Accepting is also what finally populates the inventory leg of the nightly soft-URI cron. Until now the only writer of `inventory_item_uri` was an ingest payload that supplied one, which no shipped adapter does.

## Who may call it

An inbound service-account gate covers the whole contract surface ([ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md)). It is derived from `purchasesContract` rather than a hand-kept path list, so a new route is gated the moment it exists. `/health`, `/pillars` and `/openapi` are outside the contract and stay ungated — the compose healthcheck and the image smoke probe need no credential.

A caller presenting an `X-API-Key` is held to the service account behind it: an unknown or revoked key is `401`, a live key whose grant misses the operation is `403` logged with the account name and the exact missing scope, and a registry that cannot be reached is `503` rather than admission. Scopes are dotted and match by prefix, so `purchases.purchase` authorises `purchases.purchase.list` and nothing under `purchases.source`.

**The ingest paths present a key (POPS-1806).** The ingest CLI (`scripts/backfill.ts`) and the operator smoke script (`infra/smoke/purchases-reconcile.sh`) both read `POPS_INTERNAL_API_KEY` — the same variable the server SDK reads — and send it as `X-API-Key` on **every call they make into this pillar's contract**. Neither falls back to an anonymous call: an absent key aborts the run before the first request, because a fallback here would exempt exactly the callers this gate exists to hold. Both are therefore held to their account's grant, which must carry `purchases.source` and `purchases.purchase`; that grant is a row in the registry DB, an operator step rather than a repo change, and until it exists these two return `403` where they used to be admitted.

The smoke script's remaining requests deliberately carry no key, and the distinction matters to anyone auditing callers rather than being a hedge: its `/health` probes are outside the contract and gated by nothing, while its registry roster lookup and its finance transaction seed are calls into _other_ pillars. Presenting a purchases-scoped account's key to finance would hold it to a grant it does not have, so the seed stays anonymous — and it is what would break the day finance flips its own `requireCredential`.

**A caller presenting no key is still admitted, and that is a decision, not an omission.** `requireCredential` is `false`. Two callers still present none. Browser traffic is one: this pillar's SPA reaches the API through the shell's nginx proxy, which injects no key. `src/api/__tests__/two-process.test.ts` is the other — its requests _into_ this pillar carry no key deliberately, so it drives the real server over HTTP and proves the anonymous path still works, which makes it the coverage for this decision rather than an instance of the problem. (The process it spawns does hold a key, because its own outbound leg needs one; that is the section below.) Closing the unauthenticated in-network path is a decision about ADR-027's docker-network boundary: it is fleet-wide, and it is not this pillar's to make alone.

This is not a weaker gate, and it is no longer untested. The whole mechanism is installed — scope table, revocation, fail-closed `503` — and the pillar's credentialled callers are real: the MCP tools in `pillars/mcp/src/tools/purchases.ts` reach it through `getPillar('purchases')`, which always sends an `X-API-Key`. They are held to the MCP service account's grant, so that account needs `purchases.purchase`, `purchases.analytics` and `purchases.search` or every one of them returns `403` (POPS-1878). That grant is a row in the registry DB — an operator step, not a repo change.

**What would reverse the `false`:** browser traffic, and only browser traffic. The ingest callers were the cheap half of that list and they now carry keys; the two-process test would flip with the flag, since it is a test of this pillar rather than a deployment of it. The browser leg is the whole remaining blocker: the shell's `_pillar-proxy.conf` injects no `X-API-Key`, no pillar SPA in the fleet sends one, and a key injected at the edge would be forgeable by any in-network caller, which ADR-044 rejected outright.

**A test closes the same path anyway, on purpose.** `PURCHASES_REQUIRE_SERVICE_ACCOUNT_CREDENTIAL` (`resolveRequireCredential` in `src/api/middleware/service-account-scope.ts`) flips `requireCredential` to `true` for the duration of a run — the mechanism the browser leg above can never reach in production, because `resolveRequireCredential` also requires `NODE_ENV !== 'production'`, and compose sets `NODE_ENV=production` on every deployed container. `pillars/bfm/src/api/purchases/__tests__/receipt-upload.live-seam.test.ts` sets it so the suite can prove a presented `X-API-Key` is actually checked rather than merely admitted alongside everything else — a live-seam suite that only ever sends a credentialled call cannot otherwise tell "the grant was checked" from "nothing was checked and happened to agree." Never set it anywhere else.

## Who it calls, and as whom

The mirror of the section above, and the half with a production failure mode. purchases makes five outbound cross-pillar calls, all through `pillar()` from `@pops/pillar-sdk/server`, which attaches the pillar's service-account key as `X-API-Key`:

| Leg                            | Call                | Scope needed           | Where                           |
| ------------------------------ | ------------------- | ---------------------- | ------------------------------- |
| reconciliation candidate fetch | `transactions.list` | `finance.transactions` | `src/api/finance/client.ts`     |
| soft-URI check, inventory      | `items.get`         | `inventory.items`      | `src/api/cron/pillar-lookup.ts` |
| soft-URI check, documents      | `paperless.get`     | `documents.paperless`  | `src/api/cron/pillar-lookup.ts` |
| receipt merchant resolution    | `entities.list`     | `contacts.entities`    | `src/api/contacts/merchant.ts`  |
| accepted proposal → asset      | `items.create`      | `inventory.items`      | `src/api/inventory/client.ts`   |

**Four of those five read. The last one writes**, and it is the only call in this pillar that changes data another pillar owns — see [the fan-out](#the-inventory-fan-out) for why it sits here rather than in the browser, and what that costs. Note what the Scope column shows: it needs no scope the cron's `items.get` did not already carry, because prefix matching cannot separate reading an item from creating one. The list below therefore did not grow when this leg landed, which is exactly why the leg is documented in three places instead.

The grant is those four scopes and nothing wider; `src/api/pillars/service-account.ts` is its source of truth and a test pins the list. Scopes are dotted and match by prefix, so `finance.transactions` reaches `transactions.list` and not `budgets.list`. Minting the account is an operator step against the registry's `userOnly` admin surface — the same runbook as [`pillars/bfm/README.md`](../bfm/README.md#provisioning-the-service-account), with `"name":"purchases"` and these scopes — and the plaintext goes in the Docker secret described by [`infra/secrets.example/purchases/README.md`](../../infra/secrets.example/purchases/README.md).

**`/server`, never `/client`.** The SDK exports two `pillar()` functions of the same name and shape; the `/client` one is unauthenticated. A backend that imports it compiles, runs, and sends no key — which works for exactly as long as every callee still admits keyless callers. All three of these clients did import it. `src/api/pillars/__tests__/outbound-credential.test.ts` is what keeps the fix honest: it drives each leg through the real SDK against a real socket and asserts the header on the wire, and keeps a `/client` control alongside that asserts the absence.

**The point of all of it is that a refusal is loud.** Every one of the read legs is written to survive its callee being down — the sweep writes nothing, the cron leaves each flag as it was, an unresolved merchant is a normal outcome — so a `401`/`403` folded into `unavailable` would be swallowed by design, and the first symptom would be data that quietly stopped updating. So a refused credential is its own outcome everywhere it can be: the cron counts `unauthorized` separately from `unavailable` in every leg line and tick total, the finance leg reports `unauthorized` as its skip reason, and each logs a line naming the account rather than the pillar. A process holding no key at all reports `no-credential` and never issues the call. The create leg has a person waiting on it rather than a cron, so it goes further and answers `502` with the refusal named — but it logs the same line, because the remedy is the same operator step and nothing about it clears on its own.

**A missing key does not stop the pillar booting**, unlike `bfm`. Everything this pillar's own contract serves is local, so refusing to start would trade a degraded reconciliation for a dead pillar. The absence is reported once at boot instead.

### The fifth call is not a service-account call

The receipt drop-zone's vision extraction reports its usage, cost and latency to the ai pillar's `POST /ai-usage/record` through `@pops/ai-telemetry`, like every other Claude caller in the fleet. That ingest does not read `X-API-Key`. It is gated by the per-caller credential of [ADR-039](../../docs/architecture/adr-039-pillar-isolation.md): a `purchases.<secret>` value in `x-pops-internal-credential`, which the ai pillar verifies against its own `POPS_INTERNAL_SECRET_PURCHASES` and the `ai.usage.record` scope. The two credentials are not interchangeable, and holding one says nothing about holding the other.

This pillar reads its half from `POPS_INTERNAL_CREDENTIAL_FILE` first and `POPS_INTERNAL_CREDENTIAL` second — the file-then-environment order every secret here uses, in `src/api/secret-source.ts`. The deploy delivers the credential inline in `POPS_INTERNAL_CREDENTIAL`, through the per-caller internal-auth env file every other reporting pillar receives; the file variant is there because the resolver is shared, not because anything mounts one today. `src/api/ai-ledger-credential.ts` is the source of truth for the caller name and both variables; the ai pillar's accepted-caller row is in `pillars/ai/src/api/app.ts`. Provisioning both halves together is the whole job: either alone is worth nothing.

**Reporting is best-effort, but it is not silent.** A record the ai pillar refuses — no credential, a stale secret, a grant that does not carry the scope — is logged with the status and both variable names rather than dropped; a record that never reached the pillar at all is logged as the delivery failure it is, without sending an operator after a credential that may be fine. That matters because the failure it hides is invisible by construction: the extraction succeeds, the user gets their receipt, the tokens are spent, and only the fleet's AI spend figure is wrong, by exactly this pillar's share. `src/ingest/receipt/__tests__/ledger-attribution.test.ts` drives a receipt through the real wrapper against a real socket and asserts both: the credential and the attributed record on the wire, and the log line when the pillar refuses.

The sink is a no-op when neither `AI_API_URL` nor `POPS_API_URL` resolves, which is what keeps the test suite off the network; the deployed stack sets `AI_API_URL`.

## The assistant surface

Purchases holds the only line-item-granularity spend data in the fleet, and until POPS-1753 it was the one pillar nothing could ask a question of. The decision that ticket asked for is **yes to both seams, on the grounds that neither one is a frontend**:

- **`POST /search`**, declared as two adapters in the manifest — `orders` and `lineItems`, both served by the one route. The orchestrator federates a pillar when its registered manifest carries a non-empty `search.adapters`, and it reaches the pillar by POSTing `{ query, context }` over the pillar SDK. No bundle is involved, so the absent `app/` was never the reason this was missing. The order adapter matches a merchant label or order id; the line adapter matches a product name or SKU, which is the half nothing else in the fleet can answer — finance can tell you $412.80 went to Amazon, only this can tell you which order the dosing funnel was in.
- **Five read-only MCP tools** in `pillars/mcp/src/tools/purchases.ts`: order list, order get, free-text search, items-by-tag, and the merchant roll-up. They call these routes server-side through the SDK exactly as the `finance` tools do, and `finance/app` is not what makes those work either.

**`query.filters` narrows the same orders every other read narrows.** The envelope's structured filters take three fields — `source`, `status` and `orderedAt` — which are the scope terms `GET /purchases` and `GET /analytics/merchant-spend` already take, and they are translated into the one `purchaseFilterConditions` every scoped read on this pillar goes through rather than into SQL of their own. Both adapters honour them, and a line is in scope exactly when the order it was bought on is, because a line carries no source, status or date of its own. Repeating an equality filter widens it to set membership, exactly as `?sources=a&sources=b` does on the index; repeating a bound tightens it, which is what a conjunction of bounds already means.

The vocabulary is closed in the contract, and therefore in the OpenAPI projection and in every generated client, so a field outside it is a `400` from the contract itself. A supported field paired with an operator it does not take (`orderedAt eq`), or a value the field cannot hold (`status eq shipped`, a shipment status, or an `orderedAt` bound carrying a timezone offset rather than `Z`), is a `400` from the handler naming both halves. The offset refusal is the narrow half of a wider hazard: `orderedAt` is a text column and every date window in the pillar is a lexicographic comparison on it, so a stored value in another valid ISO form lands in the wrong window and no filter can fix that from the outside (POPS-2070). **Both carry the body the route declares**, which needed a `requestValidationErrorHandler`: ts-rest rejects a schema mismatch ahead of every handler and answers with `{ name, issues }` of its own, so until now each route that declared a `400` as `ErrorBody` was describing only the half of that status a handler produced. It is installed for the whole contract rather than for search, since a `limit` that is not a number was always reachable too. Nothing is ever dropped instead: a filter that arrives and is ignored returns a `200` no caller can tell from a filter that matched broadly, and the contract advertising a capability the handler does not have is worse than refusing the request.

Read-only is not caution, it is the same invariant the rest of this file turns on: every write here is either an ingest (which needs a checksum only an adapter can compute) or a classification decision, and `PATCH /purchases/:id/items/:itemId` is the single place a machine proposal becomes a human assertion. A tool that could call it would erase the distinction `kindConfirmedAt` exists to hold.

A search hit now navigates. Hits carry `pops:purchases/purchase/<id>` and `pops:purchases/purchase-item/<id>`; `libs/navigation/src/uri-resolver.ts` maps both, the app mounts `/purchases/:purchaseId` behind them, and `uri.types` claims the two types now that something resolves them. A line resolves to the order it was bought on, at `?item=<id>`: ADR-012 keeps the id segment one row's primary key, so the order id travels in the hit's `data` — where the item adapter already puts it, because a line is meaningless without its order — rather than in the URI. Sending a line hit to an order it does not belong to would be worse than not moving at all, so a hit that arrives without its order id resolves to nothing.

Two things this still does not buy, both real:

- **The MCP tools need a grant.** As the section above says, this pillar admits an uncredentialled caller but holds a caller presenting an `X-API-Key` to that key's scopes — and MCP always presents one. The tools return `403` until the MCP service account carries `purchases.purchase`, `purchases.analytics` and `purchases.search`. That is an operator step in the registry DB, not a repo change (POPS-1878).
- **Federated search reaches no pillar in production yet, purchases included.** The orchestrator container is issued no service-account credential, so `pillar(id)` throws before a request leaves the process and every fan-out leg is logged and skipped — global search has been answering `{"sections":[]}` for every pillar, not just this one (POPS-12). The adapters declared here are correct and inert until that is fixed; the MCP tools do not depend on it, because MCP has a key of its own.

`ai.tools` stays empty, and that is a different decision rather than the same one twice. That slot hosts tool _definitions_ for the orchestrator's own tool-router to project; purchases' assistant reach is the MCP module above. Finance, inventory, media and cerebrum all declare `ai.tools: []` and all ship MCP tools.

## What is deliberately absent

- **Gmail IMAP ingest** (POPS-242). The ongoing feed, once the export/upload paths proved the reconciliation model — they have: `src/ingest/` carries `amazon/`, `amazon-digital/`, `woolworths/` and `receipt/` today. Email is the one source still unwritten.
- **The merchant lens** (POPS-241). Its backend has been there since POPS-1752 (`GET /analytics/merchant-spend` above); the view is a separate slice. The reconciliation queue, the other half of that ticket, now exists at `/purchases` — see [`app/README.md`](app/README.md) for what its two decisions do and do not persist.

**A frontend is no longer among them (POPS-1506).** This pillar used to have no `app/` directory, and `buildPurchasesManifest` declared no `nav` and no `pages` on the grounds that a rail entry pointing at a bundle slot that does not exist is a dead link. That reasoning was never an argument against a frontend — it was an argument against advertising one before the slot existed. `pillars/purchases/app` is that slot, so both dimensions are now declared: one nav item, one page descriptor, one route, kept the same size on purpose. The pillar sits on the app rail between finance and media, because reconciliation is a two-pillar workflow and the operator crosses between them constantly.

That same argument used to be extended to `search.adapters` and `ai.tools`, and it never covered them — see [the assistant surface](#the-assistant-surface) above for what POPS-1753 decided instead.

## Tests

Three of these do work the rest cannot, and are worth knowing about before changing anything here.

**`contract-conformance.test.ts`** parses responses back through the zod schema the contract publishes. ts-rest validates _requests_ against the contract but not responses, so without this the contract is only half-enforced — and the generated Hey API client a frontend consumes is derived from those schemas, so a field returned as `null` where the schema says `string` produces a client whose types are a polite fiction. It also asserts `POST` and a subsequent `GET` return identical bodies, and that every declared route carries a unique `operationId`. It does not reach every declared route: the receipts and reconcile-write paths are unparsed (POPS-1772).

**`accounting-properties.test.ts`** generates orders from a seeded PRNG and asserts what must hold for _any_ combination: the identity reconstructs, authorizations move nothing, a refund never raises the residual, every bucket is a safe integer. The example-based tests beside it were written from the same understanding that produced the code and share its blind spots — this one found a real modelling error on its first run. Generation is seeded rather than random, and the seed is printed on failure, so a case can be replayed.

**`schema-migration-drift.test.ts`** covers the third gap. The drizzle definitions and the hand-written migration are two independent descriptions of the same database and nothing forces them to agree — there is no `drizzle-kit generate` step here. It introspects the migrated database and diffs its tables, columns and NOT NULL against the drizzle schema in both directions. Without it, a column added to `src/db/schema/*.ts` without a matching migration edit would typecheck, pass every service test that doesn't touch it, and fail in production on the first INSERT. Foreign keys, `ON DELETE` behaviour and indexes are checked against literal lists inside the test rather than against drizzle, so that guarantee does not extend to them (POPS-1773).

Coverage carries a threshold ratchet in `vitest.config.ts`.

**Chasing a flake.** This suite has produced three intermittent-failure reports (POPS-1349, POPS-1430, POPS-1567) that all evaporated because nobody kept the output of the run that actually went red. From the repo root, `node scripts/flake-hunt.mjs --filter @pops/purchases [--coverage]` runs the suite in a loop and keeps a red run's full JSON report, stdout/stderr, failing test name(s), loop iteration, wall clock, and load average at start and end — deleting everything from the green runs so an unattended soak doesn't fill the disk. See its `--help` for the full option set; it works for any unit, not only this one.

**An unmatched route is not silent.** `unmatchedRouteHandler` (`src/api/middleware/unmatched-route.ts`) is the last thing mounted in `createPurchasesApiApp`: a request whose method and path match no route logs both server-side and answers the same `{ message, code }` shape every other rejection here uses, instead of Express's silent, unparseable HTML default. `OPTIONS` is passed through untouched so Express still builds its automatic `Allow` response. This covers unmatched routes only — a 404 a handler returns itself, such as a purchase id that does not exist, still writes nothing server-side. It was prompted by POPS-1312, one `POST /purchases` in 748 answering 404 with an empty body during a real backfill, which was never reproduced and is not explained by anything in this handler; that ticket stays open on its own terms, and POPS-2303 tracks whether the rest of the fleet gets the same handler.

## Local development

```bash
cd pillars/purchases && pnpm install && pnpm dev
```

`PURCHASES_SQLITE_PATH` overrides the DB location; failing that, `SQLITE_PATH`'s directory is used; failing that, `./data/purchases.db`. Set `POPS_REGISTRY_ENABLED=true` to exercise registration against a local `registry`.
