# FS-003: Entities

## What It Is

A registry of merchants, payees, and other named counterparties that transactions are matched against. Entities are the link between raw bank descriptions ("WOOLWORTHS 1234 SYDNEY") and meaningful names ("Woolworths"). They also carry default tags and transaction types, so when a transaction is matched to an entity, it's automatically categorised.

## Data Model

**Table:** `entities`

| Field | Type | Purpose |
|-------|------|---------|
| `id` (notion_id) | TEXT PK | UUID, legacy from Notion import |
| `name` | TEXT | Display name (e.g., "Woolworths") |
| `type` | TEXT | Category (e.g., "Supermarket", "Subscription", "Fuel Station") |
| `abn` | TEXT | Australian Business Number (nullable) |
| `aliases` | TEXT | Comma-separated alternative names for matching |
| `default_transaction_type` | TEXT | Auto-assigned type when matched ("Income", "Expense", "Transfer") |
| `default_tags` | TEXT | JSON array of default tags auto-suggested on match |
| `notes` | TEXT | Free-form notes (nullable) |
| `last_edited_time` | TEXT | ISO timestamp |

## User Capabilities

### Browse and Search
- Paginated list (100 per page)
- Search by name or type
- Columns: Name, Type (badge), ABN, Aliases, Default Tags, Notes

### Create Entity
- Form: name (required), type, ABN, aliases, default transaction type, default tags, notes
- Name uniqueness enforced (409 on duplicate)

### Edit Entity
- All fields editable via dialog
- Renaming an entity does NOT retroactively update `entity_name` on existing transactions (denormalisation debt)

### Delete Entity
- Confirmation required
- Cascade: transactions referencing this entity have `entity_id` set to NULL (ON DELETE SET NULL)
- `entity_name` on transactions is NOT cleared (denormalised copy persists)

### Quick Create During Import
- EntityCreateDialog in the import review step
- Minimal form: name + type
- Created entity immediately available for matching in the current import

## Entity Types

Free-form text, but common values:
- Supermarket, Subscription, Fuel Station, Retailer, Restaurant, Utility, Transport, Government, Income (Employer), Insurance, Health, Education

No predefined enum — types are created as entities are added.

## Aliases

Comma-separated text field for alternative names. Used by the entity matcher (Stage 1) to resolve bank descriptions that don't match the canonical name.

Example: Entity "McDonald's" might have aliases "MCDONALDS, MCD'S, MACCAS"

Aliases are loaded into the matching pipeline at import time and checked during the alias stage.

## Default Tags

JSON array of tags that are auto-suggested when a transaction is matched to this entity.

Example: Entity "Woolworths" has `default_tags: ["Groceries"]`. When a transaction matches Woolworths, "Groceries" is suggested as a tag with source "🏪 Entity".

## Cross-Domain Usage

Entities are currently finance-specific but will be promoted to a platform-level concept in Foundation Epic 3 (API Modularisation). They'll move to `core/entities/` and serve all domains:
- Finance: merchants and payees
- Inventory: "purchased from" vendor
- Future: media streaming services, travel accommodation providers, etc.

## Volume

~940+ entities. Growing slowly as new merchants are encountered during imports.
