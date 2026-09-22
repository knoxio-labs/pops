# ADR-053: Contacts owns a merchant's addresses; purchases references one by id

## Status

Accepted — 2026-09-22.

## Context

The receipt extractor reads a branch address off the paper (`ExtractedReceipt.address`). Nothing stores it: `pillars/purchases/src/db/schema/purchases.ts` carries `merchantEntityId`, `merchantEntityName`, `settlementMode`, `paymentHint` and `rawRef`, and no column for where the shop was. `purchase_capture` (ADR-047) holds a latitude and longitude from the photograph's EXIF, which is where the phone was, not what the paper said. Meanwhile `ReceiptResultContent` displays the extracted address and `ReceiptDraft` carries a field for it that a reviewer can correct — read, shown, edited, and dropped on save.

The branch is often the only thing on the paper that distinguishes `WOOLWORTHS METRO TOWN HALL 3182` from any other Woolworths, and it is exactly the signal that would let a wrong merchant match be spotted. Two of five purchases in production resolve to no merchant entity at all; discarding the address makes the same receipt unidentifiable the second time somebody looks at it. It also makes the address picker designed for the handset (`ReceiptMerchantChoice`) a control with nothing behind it — choosing a branch would be an edit that does not survive the save.

Two shapes were available for where the address belongs, and they are not equivalent:

- **On the order**, as the branch this purchase was made at. Simple, and it is a fact about the purchase — the same shop at two branches is two different places to have been.
- **On the contacts entity**, with the order referencing one. Matches how `merchantEntityId` already works, keeps one spelling per branch, and is what makes a picker over "this merchant's addresses" meaningful rather than a list of whatever was typed before.

`FeatureReceiptCapture`'s `ReceiptMerchantChoice.swift` already assumes the second shape — it carries a merchant's addresses, not a single free-text field on the order.

## Decision

**Contacts owns a merchant's addresses. Purchases references one by id.**

Contacts gains an `entity_addresses` table: one row per branch, `{ id, entity_id, value, last_edited_time }`, `entity_id` referencing `entities(id)` with `ON DELETE CASCADE`. It is exposed as `GET`/`POST /entities/:id/addresses` (`entities.addresses.list` / `entities.addresses.create`).

Purchases gains two nullable columns, mirroring `merchant_entity_id` / `merchant_entity_name`:

- `merchant_address_id TEXT` — a contacts `entity_addresses.id`, no foreign key (purchases never depends on contacts' schema directly, the same posture `merchant_entity_id` already takes).
- `merchant_address_name TEXT` — the address text kept verbatim, the way `merchant_entity_name` keeps the till's own wording beside `merchant_entity_id`. An address matched to a branch and an address nobody recognised are different facts, and the printed wording is what a later match would be attempted against.

Both are written on create; neither is backfilled.

## Consequences

- Server-side auto-matching of a printed address string to a contacts branch (the `entity_addresses` equivalent of `chooseMerchant`'s name matching) is explicitly **out of scope** of this decision. A picker or a reviewer chooses the address; nothing infers it from OCR text yet. Follow-up tracked as POPS-4328.
- A purchase's `merchant_address_id` can point at a branch that is later edited or deleted in contacts (no FK, no cascade enforcement across pillars) — the same trade `merchant_entity_id` already makes, for the same reason: purchases and contacts are independent pillars with independent lifecycles (ADR-039).
- The address picker on the handset now has something to write to: choosing a branch persists past the round trip.

## Cross-references

- ADR-042 (purchase documents and transaction reconciliation) — the `purchases` pillar and its provenance-preserving posture toward extracted-vs-confirmed fields, which this decision extends to the merchant's address.
- ADR-047 (purchases stores capture location) — the precedent for keeping raw phone/photograph data distinct from a resolved, referenced fact; `merchant_address_id`/`merchant_address_name` follow the same "verbatim beside resolved" shape `merchant_entity_id`/`merchant_entity_name` already established.
