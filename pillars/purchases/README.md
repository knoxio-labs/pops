# purchases

A bank transaction is an aggregate: `AMAZON MKTPLACE AU $412.80` records that money moved and nothing about what was bought. This pillar owns the other half — the order, its deliveries, its line items, and the charges that paid for it. The reasoning, the alternatives, and why this is a pillar rather than a finance module are in [ADR-042](../../docs/architecture/adr-042-purchase-documents-and-transaction-reconciliation.md).

Port 3013, `purchases.db`, registers itself with `registry` on boot.

## The shape

An **order** is the single point of entry. Five flat lists hang off it, and the cross-references between those lists are all optional:

```
purchases  (the order)
  ├─ purchase_shipments             every delivery
  ├─ purchase_items                 every line, complete
  │    ├─ purchase_item_units       per-unit identity → inventory
  │    ├─ purchase_item_tags        POPS classification, proposed or asserted
  │    └─ purchase_item_notes       verbatim merchant prose, ordered
  ├─ purchase_charges               every charge, matched or not
  │    ├─ purchase_charge_links     charge → finance transaction
  │    └─ purchase_item_allocations which charge paid for which line
  ├─ purchase_tags                  facts about the order that aren't fields
  └─ purchase_documents             evidence → documents
```

Four grains, because real purchase data has four and collapsing any of them loses information that cannot be recovered. One Amazon order ships in three boxes and settles as two card charges. One AliExpress order trickles in over two months. A quantity-3 line becomes three inventory records with three serial numbers.

## Two things that are load-bearing

**A charge does not depend on finance.** `purchase_charges` records what the merchant says was charged; `purchase_charge_links` attaches a `pops://finance/transaction/<id>` once one is imported. The weeks between "Amazon charged the card" and "the statement was imported" are a represented state, not a gap. An earlier draft made a charge _be_ the link, which meant a perfectly normal order looked unexplained for a month.

**Charge grouping is not assumed to equal delivery grouping.** Amazon sometimes charges per product group rather than per box, and whether AliExpress's purchase-time groupings map to deliveries is unverified. So a charge belongs to the _order_ — always correct — and names a shipment only when the evidence supports it. No "charge block" entity has been invented on a guess. If blocks do turn out to equal deliveries, that will show up as `purchase_charges.shipment_id` being reliably populated, and the entity can be introduced then with real data behind it.

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

`GET /analytics/merchant-spend` is the pillar's only aggregate route. Everything else is a row reader, and a merchant headline cannot be assembled from row readers: `GET /purchases` pages at 500 and returns no charge-link state, and `GET /items` cannot enumerate without a `tag`.

It answers one question — what was spent per merchant over a period, and how much of it is explained — and returns the same six figures the per-order split does, summed. `residualCents` is in the response rather than derived by the caller: a consumer that has to compute the unexplained bucket is a consumer that can forget to, and a view which drops it turns a known unknown into a false certainty.

Two things it deliberately does not do:

- **It does not add currencies together.** Groups are keyed on merchant _and_ currency, and `totals` carries one entry per currency rather than one grand total. There is no meaningful sum across currencies, and returning one would look authoritative.
- **It takes no `limit`.** A roll-up over the first 500 of 748 orders is not a smaller answer, it is a wrong one, and nothing in the response would say which it was. The period is the only bound.

Merchant attribution is reported three ways, because the pillar has two different things called a merchant: `entity` (grouped on a resolved `contacts` entity id, the operative identity), `name` (grouped on the label, because no entity was ever attached), and `unattributed` (the order names no merchant). Today every export-ingested order lands under `name` — no export adapter sets an id, only receipt ingest does (POPS-1852). Collapsing the three would report a string match as an identity, and orders naming no merchant would vanish from a total that claims to describe them.

The fold reuses `computeAccounting` per order rather than restating the split as `SUM()` in SQL, so the residual keeps exactly one implementation. That is also why the arithmetic happens after the rows are re-grouped and not in the database: an order with three charges appears three times in a charge join and six times once links are joined, and a database-side `SUM(total_cents)` would report six times what was spent.

**What POPS-244 still needs on top of this**, none of which this route provides:

- a repeat-purchase leaderboard at the product grain (POPS-1849), which needs the line-item identity normalisation of POPS-243 to group on anything better than `sku`;
- the consumable-vs-durable kind split (POPS-1850). Its substrate now exists — `kind` and `kindConfirmedAt` — so it must be **three** numbers, confirmed-consumable, confirmed-durable and unreviewed, mirroring `matched` / `awaitingImport` / `residual`. A two-way percentage would report a classification pass's proposal as a finding;
- tag counterfactuals such as "cut all `snack` line items" (POPS-1851). Item tags now carry their own `confirmedAt`, so the same three-way rule applies — but they are still drawn from whatever a classification pass proposed rather than being guaranteed finance `tag_vocabulary` slugs, and a counterfactual is only as meaningful as the vocabulary it groups on.

## Other invariants that span files

**All money is integer cents.** `CentsSchema` is `z.int()`, so a float is a validation error rather than a silent rounding. Not stylistic: stage 2 of the reconciliation ladder is subset-sum, which is exact over integers and is not exact over anything else.

**A charge carries two amounts.** `amountCents` is in the settlement currency — what moved on the card, and what the matcher compares against finance transactions. `orderAmountCents` is the same money in the order's currency, which is what the residual is computed in. For a USD AliExpress order settling in AUD they differ; for everything else they are equal, stored anyway so the residual never branches.

**`totalCents` is not constrained to the sum of its components.** Profiling the real Amazon DSAR export found `subtotal + shipping + tax − discount` holding on 926 of 943 rows; the rest drift by cents on older orders. A CHECK on the identity would reject valid orders at ingest, so adapters record the order and route the mismatch to review. Component non-negativity _is_ enforced.

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

## Who may call it

An inbound service-account gate covers the whole contract surface ([ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md)). It is derived from `purchasesContract` rather than a hand-kept path list, so a new route is gated the moment it exists. `/health`, `/pillars` and `/openapi` are outside the contract and stay ungated — the compose healthcheck and the image smoke probe need no credential.

A caller presenting an `X-API-Key` is held to the service account behind it: an unknown or revoked key is `401`, a live key whose grant misses the operation is `403` logged with the account name and the exact missing scope, and a registry that cannot be reached is `503` rather than admission. Scopes are dotted and match by prefix, so `purchases.purchase` authorises `purchases.purchase.list` and nothing under `purchases.source`.

**A caller presenting no key is still admitted, and that is a decision, not an omission.** `requireCredential` is `false`. The pillar's ingest paths present no credential — the ingest CLI (`scripts/backfill.ts`), the operator smoke script (`infra/smoke/purchases-reconcile.sh`), and `src/api/__tests__/two-process.test.ts`, which drives the real server over HTTP. Requiring a credential would 401 the pillar's only working data paths, and closing the unauthenticated in-network path is a decision about ADR-027's docker-network boundary: it is fleet-wide, and it is not this pillar's to make alone.

This is not a weaker gate, and it is no longer untested. The whole mechanism is installed — scope table, revocation, fail-closed `503` — and the pillar now has its first credentialled caller: the MCP tools in `pillars/mcp/src/tools/purchases.ts` reach it through `getPillar('purchases')`, which always sends an `X-API-Key`. They are held to the MCP service account's grant, so that account needs `purchases.purchase`, `purchases.analytics` and `purchases.search` or every one of them returns `403` (POPS-1878). That grant is a row in the registry DB — an operator step, not a repo change.

**What would reverse the `false`:** all three existing callers carrying keys of their own, plus an answer for browser traffic. The first three are cheap — mint an account and read a key from env. The browser leg is not, and is the real blocker: the shell's `_pillar-proxy.conf` injects no `X-API-Key`, no pillar SPA in the fleet sends one, and a key injected at the edge would be forgeable by any in-network caller, which ADR-044 rejected outright.

## The assistant surface

Purchases holds the only line-item-granularity spend data in the fleet, and until POPS-1753 it was the one pillar nothing could ask a question of. The decision that ticket asked for is **yes to both seams, on the grounds that neither one is a frontend**:

- **`POST /search`**, declared as two adapters in the manifest — `orders` and `lineItems`, both served by the one route. The orchestrator federates a pillar when its registered manifest carries a non-empty `search.adapters`, and it reaches the pillar by POSTing `{ query, context }` over the pillar SDK. No bundle is involved, so the absent `app/` was never the reason this was missing. The order adapter matches a merchant label or order id; the line adapter matches a product name or SKU, which is the half nothing else in the fleet can answer — finance can tell you $412.80 went to Amazon, only this can tell you which order the dosing funnel was in.
- **Five read-only MCP tools** in `pillars/mcp/src/tools/purchases.ts`: order list, order get, free-text search, items-by-tag, and the merchant roll-up. They call these routes server-side through the SDK exactly as the `finance` tools do, and `finance/app` is not what makes those work either.

Read-only is not caution, it is the same invariant the rest of this file turns on: every write here is either an ingest (which needs a checksum only an adapter can compute) or a classification decision, and `PATCH /purchases/:id/items/:itemId` is the single place a machine proposal becomes a human assertion. A tool that could call it would erase the distinction `kindConfirmedAt` exists to hold.

Three things this does not yet buy, all real:

- **A search hit does not navigate.** Hits carry `pops:purchases/purchase/<id>` and `pops:purchases/purchase-item/<id>` URIs. `libs/navigation/src/uri-resolver.ts` maps `{app}/{type}` to a route prefix through a literal table, and neither prefix is in it — so `resolveUri` returns null, `navigateTo` returns false, and the click is a silent no-op. POPS-1506 landing the app did not fix this: it mounts one index route and no order-detail route, so there is still nothing for a hit to land on. `uri.types` stays empty for the same reason — a hit needs an identity whether or not anything can navigate to it, but the pillar will not claim a handler it does not have (POPS-1877).
- **The MCP tools need a grant.** As the section above says, this pillar admits an uncredentialled caller but holds a caller presenting an `X-API-Key` to that key's scopes — and MCP always presents one. The tools return `403` until the MCP service account carries `purchases.purchase`, `purchases.analytics` and `purchases.search`. That is an operator step in the registry DB, not a repo change (POPS-1878).
- **Federated search reaches no pillar in production yet, purchases included.** The orchestrator container is issued no service-account credential, so `pillar(id)` throws before a request leaves the process and every fan-out leg is logged and skipped — global search has been answering `{"sections":[]}` for every pillar, not just this one (POPS-12). The adapters declared here are correct and inert until that is fixed; the MCP tools do not depend on it, because MCP has a key of its own.

`ai.tools` stays empty, and that is a different decision rather than the same one twice. That slot hosts tool _definitions_ for the orchestrator's own tool-router to project; purchases' assistant reach is the MCP module above. Finance, inventory, media and cerebrum all declare `ai.tools: []` and all ship MCP tools.

## What is deliberately absent

- **Gmail IMAP ingest** (POPS-242). The ongoing feed, once the export/upload paths proved the reconciliation model — they have: `src/ingest/` carries `amazon/`, `woolworths/` and `receipt/` today. Email is the one source still unwritten.
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

## Local development

```bash
cd pillars/purchases && pnpm install && pnpm dev
```

`PURCHASES_SQLITE_PATH` overrides the DB location; failing that, `SQLITE_PATH`'s directory is used; failing that, `./data/purchases.db`. Set `POPS_REGISTRY_ENABLED=true` to exercise registration against a local `registry`.
