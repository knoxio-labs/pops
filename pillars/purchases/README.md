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
```

Four grains, because real purchase data has four and collapsing any of them loses information that cannot be recovered. One Amazon order ships in three boxes and settles as two card charges. One AliExpress order trickles in over two months. A quantity-3 line becomes three inventory records with three serial numbers.

## Two things that are load-bearing

**A charge does not depend on finance.** `purchase_charges` records what the merchant says was charged; `purchase_charge_links` attaches a `pops://finance/transaction/<id>` once one is imported. The weeks between "Amazon charged the card" and "the statement was imported" are a represented state, not a gap. An earlier draft made a charge _be_ the link, which meant a perfectly normal order looked unexplained for a month.

**Charge grouping is not assumed to equal delivery grouping.** Amazon sometimes charges per product group rather than per box, and whether AliExpress's purchase-time groupings map to deliveries is unverified. So a charge belongs to the _order_ — always correct — and names a shipment only when the evidence supports it. No "charge block" entity has been invented on a guess. If blocks do turn out to equal deliveries, that will show up as `purchase_charges.shipment_id` being reliably populated, and the entity can be introduced then with real data behind it.

## Both directions of the link

`GET /purchases/:id` reads the relationship forwards, from an order to the transactions backing each of its charges. `GET /reconcile/links?transactionUri=…` reads it backwards, and that is the direction a person actually arrives from: you are looking at `AMAZON MKTPLACE AU $412.80` in finance and want to know what it bought.

It returns a list of orders, not one. A combined settlement — several charges, one transaction — is a phase of the matching ladder rather than an anomaly, so an answer shaped as "the purchase" would silently drop spend the transaction on screen really did pay for. Each entry carries the charges involved, the link rows themselves, and `linkedCents`, that order's share of the transaction.

**`GET /reconcile/queue` is not a substitute, and looks like one.** The queue answers "what still wants a decision": confirming a link is what removes its charge from it, and an auto-link source never enters it at all. Both of those are established links and are exactly what a finance view is asking about, so a lookup built by scanning the queue reports "no purchase" for the two states where the relationship is most certain. The reverse lookup indexes `purchase_charge_links` directly and reports each link's `confirmedAt` rather than filtering on it — a consumer that renders a derived link as a settled fact is reporting the engine's guess.

A transaction no order explains is an empty list and a `200`. That is the ordinary case for most of a statement, and a `404` would have consumers treating "this was not a purchase" as a fault.

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

The same thing bought across N orders: per product, how many distinct orders hold it, how many lines and units, first and last purchase, summed landed cost, and every merchant it was bought from. Landed cost reuses `landedCostCents` per line rather than restating `lineTotal + allocatedShipping + allocatedAdjustment` in SQL, on the same single-implementation rule the residual follows. Nothing here joins charges or links, which is what makes "how many orders" a count of distinct order ids rather than a figure that multiplies by however many charges settled them.

**Grouping is the hard part and it is only partly solved.** A group is formed on one of three bases, and which one travels with the group:

- `sku` — the merchant's own identifier. The only basis a source asserts, and exactly one shipped adapter writes one (`sku: readText(row['ASIN'])` in the Amazon mapper). Within Amazon, repeats group perfectly.
- `name` — printed names that normalise alike, within one merchant. A **proposal**: it merges two products a till abbreviates the same way, and splits one product printed two ways. Every Woolworths and receipt line lands here.
- `unidentified` — no sku and no name that normalises to anything. Groups with nothing, one line per row, because a bucket every nameless line falls into would report a whole shop as one product.

A group never spans merchants a source did not put together. `receipt` is one source id for every shop a user photographs, so a key on the source alone would fold two cafes' `LATTE` lines into one product with one summed cost; the key is confined to the order's merchant unless the source is a single merchant's own feed, which is what keeps a Woolworths product grouped across the chain's stores instead of splitting per branch. `merchants` on a row is therefore the group's scope, not just a list of where it was seen.

The rule is `identifyProduct` in `src/db/services/product-identity.ts`, shared with the classification pass so a decision the pass made about a product and a row this route shows for it describe the same lines. Minting a durable, confirmable product identity for the sources that state none is POPS-243, and until it lands this route's answer is strong for Amazon and provisional everywhere else.

`coverage` says exactly that per request — lines in scope split across the three bases, plus the product count — so a consumer can see how much of the answer rests on printed names before it renders a row. It is computed over the whole scope, before any withholding.

`minOrderCount` is the N. It is not a page cap: it selects on the answer's own defining property, is stated by the caller, and is echoed in the response, so a group that is absent is absent for a reason the payload names. There is still no `limit`, for the reason the merchant roll-up has none. Currency is part of the grouping key here too.

**What POPS-244 still needs on top of these**, none of which these routes provide:

- the consumable-vs-durable kind split (POPS-1850). Its substrate now exists — `kind` and `kindConfirmedAt` — so it must be **three** numbers, confirmed-consumable, confirmed-durable and unreviewed, mirroring `matched` / `awaitingImport` / `residual`. A two-way percentage would report a classification pass's proposal as a finding;
- tag counterfactuals such as "cut all `snack` line items" (POPS-1851). Item tags now carry their own `confirmedAt`, so the same three-way rule applies — but they are still drawn from whatever a classification pass proposed rather than being guaranteed finance `tag_vocabulary` slugs, and a counterfactual is only as meaningful as the vocabulary it groups on.

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

## The inventory fan-out

A durable line suggests an asset. `GET /purchases/:id/inventory-proposals` is that suggestion and nothing more: **purchases writes nothing into `inventory` and this route does not create anything**. Unattended fan-out fills that pillar with cables, batteries and light globes inside a month, at which point the user stops trusting it — which is why `ITEM_KINDS` calls both fan-out directions proposals.

**What makes a proposal** is a unit slot, not a line. `purchase_items.kind = 'durable'` is the substrate and nothing here re-derives durability from a name; a quantity-3 durable line is up to three assets with three warranties, so it yields three offers answered one at a time. Two exclusions beyond the kind are load-bearing rather than fussy: a line on a `cancelled` or `returned` delivery is goods that never arrived, and a fully refunded line is goods that went back. A _partial_ refund kept the goods and gave some money back, so the line still proposes — priced net of what came back.

The payload borrows inventory's field names where that pillar has a counterpart — `itemName`, `purchaseDate`, `purchasedFromName`. **Three fields do not cross unchanged**, and anyone writing the create side (POPS-2356) needs that before assuming a straight copy works:

| field                    | what happens on the other side                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `purchasePriceCents`     | inventory's `purchasePrice` is a float dollar amount; this pillar mints no float anywhere, so dividing by 100 is the accepting caller's step                                                            |
| `purchaseTransactionUri` | inventory's `POST /items` takes a bare `purchaseTransactionId`, and `home_inventory.purchase_transaction_uri` has no REST writer at all — posted as-is, the key is silently stripped by zod (POPS-1526) |
| `serialNumber`           | inventory has no such column anywhere (POPS-2386)                                                                                                                                                       |

The last two are carried anyway: they are the strongest facts purchases holds about the asset, and a field withheld until its reader exists is a field nobody builds the reader for.

The price is the unit's share of **landed cost less anything refunded on the line**, apportioned by `allocateProRata` so a line's shares sum to that figure exactly. The sticker price of a thing is not what it cost to get it into the house, and money that came back is not part of what it cost either — `accounting.ts` derives `netSpendCents` at the order level for the same reason it is derived here rather than left to each consumer.

`purchaseTransactionUri` is filled only when exactly one **confirmed** link on a charge that **paid for the goods** names one, and all three halves matter. An unconfirmed link is the matcher's current guess, which the next sweep is free to tear down; an order paid across two transactions has no single one to name, and inventory's column holds one URI, so guessing would file the asset against half its own payment. A `refund` charge and an `authorization` charge are transactions of the order without being payments for it, so neither counts as that second one — otherwise a partially refunded order, or one whose bank recorded the card hold as its own row, would lose the link entirely, and those are exactly the orders most likely to carry a durable asset. Same pair `accounting.ts` excludes. Two other fields the ticket asked for are deliberately absent rather than null: purchases holds no `brand` and no `model` — no column, no source that states one — and splitting them out of a line name is guessing where a wrong answer is invisible afterwards (POPS-2355).

**Who accepts is a human, per item, and the accept is not this pillar's write.** `POST /purchases/:id/items/:itemId/inventory-proposal` records the answer: `accepted` carries the `pops://inventory/item/<id>` URI of a row the caller **has already created** on the inventory pillar, and `declined` records the refusal. Recording an accept before the inventory row exists would store a reference to nothing, which the nightly cron would then dutifully mark stale. That leaves the create itself — and the review UI that collects the opt-in — outside this pillar (POPS-2356, POPS-2357). Only an `inventory`/`item` URI is accepted: the column is resolved by one cron leg that marks anything else a bad URI forever, and since a decision cannot be retracted a mistyped `pops://finance/transaction/...` would be permanent.

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

The mirror of the section above, and the half with a production failure mode. purchases makes four outbound cross-pillar calls, all through `pillar()` from `@pops/pillar-sdk/server`, which attaches the pillar's service-account key as `X-API-Key`:

| Leg                            | Call                | Scope needed           | Where                           |
| ------------------------------ | ------------------- | ---------------------- | ------------------------------- |
| reconciliation candidate fetch | `transactions.list` | `finance.transactions` | `src/api/finance/client.ts`     |
| soft-URI check, inventory      | `items.get`         | `inventory.items`      | `src/api/cron/pillar-lookup.ts` |
| soft-URI check, documents      | `paperless.get`     | `documents.paperless`  | `src/api/cron/pillar-lookup.ts` |
| receipt merchant resolution    | `entities.list`     | `contacts.entities`    | `src/api/contacts/merchant.ts`  |

The grant is those four and nothing wider; `src/api/pillars/service-account.ts` is its source of truth and a test pins the list. Scopes are dotted and match by prefix, so `finance.transactions` reaches `transactions.list` and not `budgets.list`. Minting the account is an operator step against the registry's `userOnly` admin surface — the same runbook as [`pillars/bfm/README.md`](../bfm/README.md#provisioning-the-service-account), with `"name":"purchases"` and these scopes — and the plaintext goes in the Docker secret described by [`infra/secrets.example/purchases/README.md`](../../infra/secrets.example/purchases/README.md).

**`/server`, never `/client`.** The SDK exports two `pillar()` functions of the same name and shape; the `/client` one is unauthenticated. A backend that imports it compiles, runs, and sends no key — which works for exactly as long as every callee still admits keyless callers. All three of these clients did import it. `src/api/pillars/__tests__/outbound-credential.test.ts` is what keeps the fix honest: it drives each leg through the real SDK against a real socket and asserts the header on the wire, and keeps a `/client` control alongside that asserts the absence.

**The point of all of it is that a refusal is loud.** Every one of these legs is written to survive its callee being down — the sweep writes nothing, the cron leaves each flag as it was, an unresolved merchant is a normal outcome — so a `401`/`403` folded into `unavailable` would be swallowed by design, and the first symptom would be data that quietly stopped updating. So a refused credential is its own outcome everywhere it can be: the cron counts `unauthorized` separately from `unavailable` in every leg line and tick total, the finance leg reports `unauthorized` as its skip reason, and each logs a line naming the account rather than the pillar. A process holding no key at all reports `no-credential` and never issues the call.

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
