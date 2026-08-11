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
  │    └─ purchase_item_tags
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
| `netSpendCents`       | `matched + awaitingImport − refunded`                             | the headline one |

The identity to rely on: `totalCents === matchedCents + awaitingImportCents + residualCents`, with `refundedCents` orthogonal to it.

Folding `awaitingImport` into the residual would flag every recent order as broken until its statement imports — the false alarm that teaches someone to ignore the number. Folding **refunds** in is worse, and an earlier version did: a fully-paid order with an $11.79 refund reported an $11.79 residual, presenting returned money as missing money, so receiving a refund made the "something is wrong" number go _up_. A property test now asserts a refund can never increase the residual.

`residualCents` is never clamped: a negative value means over-charging, which is a bug worth seeing.

`authorization` charges are excluded from all of it. A card hold and its capture are two records of one payment, and counting both makes a correctly-settled order look doubly paid.

## Other invariants that span files

**All money is integer cents.** `CentsSchema` is `z.int()`, so a float is a validation error rather than a silent rounding. Not stylistic: stage 2 of the reconciliation ladder is subset-sum, which is exact over integers and is not exact over anything else.

**A charge carries two amounts.** `amountCents` is in the settlement currency — what moved on the card, and what the matcher compares against finance transactions. `orderAmountCents` is the same money in the order's currency, which is what the residual is computed in. For a USD AliExpress order settling in AUD they differ; for everything else they are equal, stored anyway so the residual never branches.

**`totalCents` is not constrained to the sum of its components.** Profiling the real Amazon DSAR export found `subtotal + shipping + tax − discount` holding on 926 of 943 rows; the rest drift by cents on older orders. A CHECK on the identity would reject valid orders at ingest, so adapters record the order and route the mismatch to review. Component non-negativity _is_ enforced.

**`position` is not cosmetic.** Ids are random UUIDs and every row written in one ingest shares a `createdAt` to the second, so without an explicit position the read order of lines, deliveries and charges is genuinely non-deterministic — a 100-line grocery receipt would render shuffled, and the deterministic candidate ordering the reconciliation engine needs for re-derivation to be safe would not hold.

**`merchantEntityId` is operative; `merchantEntityName` is only its label.** Entities live in `contacts` and are read live, and no mirror table exists — the same invariant finance carries on `transaction_corrections` (`pillars/finance/src/db/schema/corrections.ts`). Receipt ingest resolves a merchant name against `contacts` once, at write time, and stores the id it got back; no read path resolves by name.

**`finance` has no idea this pillar exists.** No foreign key crosses the boundary and no schema change was made on the finance side, which is what lets the two be migrated and restored independently.

**Closed vocabularies are CHECK-backed.** Every enum in `src/contract/constants.ts` has a matching CHECK in the migration. `purchase_sources` is the deliberate exception: merchants are rows, so registering Bunnings is an insert, not a deploy.

## Two states that look like errors and are not

An order with **no charge and no link** (`awaiting_settlement`) is normal and permanent. A receipt captured in October is correct in October whether or not the card that paid for it is imported in December.

A **cash** order (`settlementMode='cash'`) is terminal on arrival — `createPurchase` writes it straight to `settled_cash`. No transaction will ever exist for it, so it must never enter the reconcile queue, while still counting in every spend figure.

## Who may call it

An inbound service-account gate covers the whole contract surface ([ADR-044](../../docs/architecture/adr-044-inbound-service-account-scope-enforcement.md)). It is derived from `purchasesContract` rather than a hand-kept path list, so a new route is gated the moment it exists. `/health`, `/pillars` and `/openapi` are outside the contract and stay ungated — the compose healthcheck and the image smoke probe need no credential.

A caller presenting an `X-API-Key` is held to the service account behind it: an unknown or revoked key is `401`, a live key whose grant misses the operation is `403` logged with the account name and the exact missing scope, and a registry that cannot be reached is `503` rather than admission. Scopes are dotted and match by prefix, so `purchases.purchase` authorises `purchases.purchase.list` and nothing under `purchases.source`.

**A caller presenting no key is still admitted, and that is a decision, not an omission.** `requireCredential` is `false`. Every caller purchases has today presents no credential — the ingest CLI (`scripts/backfill.ts`), the operator smoke script (`infra/smoke/purchases-reconcile.sh`), and `src/api/__tests__/two-process.test.ts`, which drives the real server over HTTP — and it has no credentialled caller at all: nothing in the tree calls `pillar('purchases')`. Requiring a credential would 401 the pillar's only working data paths in order to constrain an empty set, so the flag would buy nothing measurable and cost everything that works. Closing the unauthenticated in-network path is a decision about ADR-027's docker-network boundary, it is fleet-wide, and it is not this pillar's to make alone.

This is not a weaker gate. The whole mechanism is installed — scope table, revocation, fail-closed `503` — so the first credentialled caller is bound to its grant without a second change. The likely first one is MCP, if purchases ever grows tools (POPS-1753); that work has to ship a grant covering the operations its tools call, or they arrive as `403`s.

**What would reverse the `false`:** all three existing callers carrying keys of their own, plus an answer for browser traffic. The first three are cheap — mint an account and read a key from env. The browser leg is not, and is the real blocker: the shell's `_pillar-proxy.conf` injects no `X-API-Key`, no pillar SPA in the fleet sends one, and a key injected at the edge would be forgeable by any in-network caller, which ADR-044 rejected outright.

## What is deliberately absent

- **A frontend.** This pillar has no `app/` directory — the slot `pillars/finance/app` and every other UI-bearing pillar fills (POPS-1506). `buildPurchasesManifest` declares no `nav` and no `pages` for that reason — a rail entry pointing at a bundle slot that does not exist is a dead link.
- **Gmail IMAP ingest** (POPS-242). The ongoing feed, once the export/upload paths proved the reconciliation model — they have: `src/ingest/` carries `amazon/`, `woolworths/` and `receipt/` today. Email is the one source still unwritten.

`search.adapters` and `ai.tools` are also empty in the manifest, but not for the frontend reason above — MCP tools and search adapters are backend seams that don't need `app/` to exist, and the `registry` pillar has neither an `app/` nor a frontend either. Whether purchases should carry either is an open decision, tracked as POPS-1753.

## Tests

Three of these do work the rest cannot, and are worth knowing about before changing anything here.

**`contract-conformance.test.ts`** parses responses back through the zod schema the contract publishes. ts-rest validates _requests_ against the contract but not responses, so without this the contract is only half-enforced — and the generated Hey API client a frontend consumes is derived from those schemas, so a field returned as `null` where the schema says `string` produces a client whose types are a polite fiction. It also asserts `POST` and a subsequent `GET` return identical bodies, and that every declared route carries a unique `operationId`. It does not reach every declared route: the receipts and reconcile-write paths are unparsed (POPS-1772).

**`accounting-properties.test.ts`** generates orders from a seeded PRNG and asserts what must hold for _any_ combination: the identity reconstructs, authorizations move nothing, a refund never raises the residual, every bucket is a safe integer. The example-based tests beside it were written from the same understanding that produced the code and share its blind spots — this one found a real modelling error on its first run. Generation is seeded rather than random, and the seed is printed on failure, so a case can be replayed.

**`schema-migration-drift.test.ts`** covers the third gap. The drizzle definitions and the hand-written migration are two independent descriptions of the same database and nothing forces them to agree — there is no `drizzle-kit generate` step here. It introspects the migrated database and diffs its tables, columns and NOT NULL against the drizzle schema in both directions. Without it, a column added to `src/db/schema/*.ts` without a matching migration edit would typecheck, pass every service test that doesn't touch it, and fail in production on the first INSERT. Foreign keys, `ON DELETE` behaviour and indexes are checked against literal lists inside the test rather than against drizzle, so that guarantee does not extend to them (POPS-1773).

Coverage carries a threshold ratchet in `vitest.config.ts`.

## Local development

```bash
cd pillars/purchases && pnpm install && pnpm dev
```

`PURCHASES_SQLITE_PATH` overrides the DB location; failing that, `SQLITE_PATH`'s directory is used; failing that, `./data/purchases.db`. Set `POPS_REGISTRY_ENABLED=true` to exercise registration against a local `registry`.
