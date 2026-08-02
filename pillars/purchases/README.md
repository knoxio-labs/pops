# purchases

A bank transaction is an aggregate: `AMAZON MKTPLACE AU $412.80` records that money moved and nothing about what was bought. This pillar owns the other half — the purchase document, its line items, and the N:M links from those documents to finance transactions. The reasoning, the alternatives, and why this is a pillar rather than a finance module are in [ADR-042](../../docs/architecture/adr-042-purchase-documents-and-transaction-reconciliation.md).

Port 3013, `purchases.db`, registers itself with `registry` on boot.

## What is here, and what is deliberately not

Shipped: the schema, the ts-rest contract, purchase and source CRUD, and the residual.

Not shipped, and not stubbed either:

- **The reconciliation engine** (POPS-237). Nothing in this tree links, matches, or sweeps. `purchase_transaction_links` and `purchase_match_rules` exist because the schema is easier to get right in one migration than in four, but no code writes to them yet.
- **Every ingest adapter** (POPS-238 Amazon export, POPS-239 Woolworths, POPS-242 Gmail IMAP). `POST /purchases` is the seam they will all write through.
- **Any frontend.** `buildPurchasesManifest` declares no `nav` and no `pages` for that reason — a rail entry pointing at a bundle slot that does not exist is a dead link, not a placeholder. `search.adapters` and `ai.tools` are empty on the same logic: declaring a search adapter the pillar does not implement makes federated search fan out to a 404.

## Invariants that span files

**All money is integer cents.** The wire schema (`CentsSchema` in `src/contract/schemas/purchase.ts`) uses `z.int()`, so a float is a validation error rather than a silent rounding. This is not stylistic: the reconciliation ladder's stage 2 is subset-sum, which is exact over integers and is not exact over anything else.

**`totalCents` is not constrained to the sum of its components.** `subtotal + shipping + tax − discount` disagrees with the merchant's own stated total often enough in real exports that a CHECK on the identity would reject valid purchases at ingest. Adapters that find a mismatch record the purchase and route it to review. The non-negativity of the component columns _is_ enforced.

**`merchantEntityId` is operative; `merchantEntityName` is only its label.** Entities live in `contacts` and are read live. Nothing here resolves an entity by name, and no mirror table exists — the same invariant `transaction_corrections` carries since #3807.

**`finance` has no idea this pillar exists.** The link table lives here and holds `pops://finance/transaction/<id>` strings. There is no foreign key across the boundary and no schema change on the finance side, which is what lets the two be migrated and restored independently.

**Closed vocabularies are CHECK-backed.** Every enum in `src/contract/constants.ts` has a matching CHECK in the migration. Adding a value means writing a migration that widens the CHECK, not just editing the tuple. `purchase_sources` is the deliberate exception: merchants are rows, so registering Bunnings is an insert, not a deploy.

**The residual is on the wire.** `GET /purchases/:id` returns `residualCents` (`totalCents − Σ linked amountCents`) rather than leaving consumers to compute it. It is never clamped to zero: a negative residual means over-linking, which is a bug worth seeing.

## Two states that look like errors and are not

A purchase with **no link** (`awaiting_settlement`) is normal and permanent. A receipt captured in October is correct in October whether or not the card that paid for it is imported in December. Spend analysis reads from purchases regardless of link state.

A **cash** purchase (`settlementMode='cash'`) is terminal on arrival — `createPurchase` writes it straight to `settled_cash`. No transaction will ever exist for it, so it must never enter the reconcile queue or a "never settled?" prompt, while still counting in every spend figure.

## Local development

```bash
cd pillars/purchases && pnpm install && pnpm dev
```

`PURCHASES_SQLITE_PATH` overrides the DB location; failing that, `SQLITE_PATH`'s directory is used; failing that, `./data/purchases.db`. Set `POPS_REGISTRY_ENABLED=true` to exercise registration against a local `registry`.
