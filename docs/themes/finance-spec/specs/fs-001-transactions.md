# FS-001: Transactions

## What It Is

A ledger of all financial transactions across bank accounts. The core data object in the finance app — everything else (entities, budgets, corrections, imports) feeds into or queries from transactions.

## Data Model

**Table:** `transactions`

| Field | Type | Purpose |
|-------|------|---------|
| `id` (notion_id) | TEXT PK | UUID, legacy from Notion import |
| `description` | TEXT | Bank-provided transaction description |
| `account` | TEXT | Bank account name (e.g., "Up Everyday", "ANZ Savings") |
| `amount` | REAL | Transaction amount. Positive = income, negative = expense |
| `date` | TEXT | ISO date string (YYYY-MM-DD) |
| `type` | TEXT | "Income", "Expense", or "Transfer" |
| `tags` | TEXT | JSON array of tag strings, e.g., `["Groceries", "Weekly Shop"]` |
| `entity_id` | TEXT FK | Links to entities table (nullable) |
| `entity_name` | TEXT | Denormalised entity name (for display without join) |
| `location` | TEXT | Where the transaction occurred (nullable) |
| `country` | TEXT | Country code (nullable) |
| `related_transaction_id` | TEXT FK | Self-join for transfer pairs (nullable) |
| `notes` | TEXT | Free-form notes (nullable) |
| `last_edited_time` | TEXT | ISO timestamp of last modification |

**Indexes:** `date`, `account`, `entity_id`, `last_edited_time`

**Key constraint:** No unique constraint on transactions — deduplication is handled at import time, not at the schema level.

## User Capabilities

### Browse and Filter
- Paginated list (100 per page, infinite scroll)
- Filter by: account, date range, tag, entity, type
- Sort by: date (default, newest first), amount
- Search by: description text
- Filters persist in URL query params (bookmarkable views)

### View Transaction Details
- All fields visible in the list table
- Entity name shown as sub-text below description
- Tags shown as coloured badges
- Amount colour-coded (green for income, red for expense)

### Create Transaction
- Manual entry form: date, description, account, amount, type, tags, entity, location, country, notes
- Entity selected via autocomplete from entities table
- Tags entered via chip input with autocomplete from known tags

### Edit Transaction
- Inline editing for: amount, tags, location (via dialog popover)
- Full edit via edit dialog for all fields
- Tag editing has a "Suggest Tags" button that calls AI

### Delete Transaction
- Confirmation required
- Hard delete (no soft delete)

### Tag System
Tags are the primary categorisation mechanism. Each transaction can have zero or more tags.

**Tag sources (in priority order):**
1. **Entity defaults** — When an entity is assigned, its `default_tags` are suggested
2. **Correction rules** — Matching rules suggest tags with source attribution
3. **AI suggestion** — Claude Haiku can suggest tags for a description

Tags are free-form strings — no predefined taxonomy. New tags are created simply by typing them. The `availableTags` query returns all distinct tags ever used (for autocomplete).

**Tag display:** Each tag shows its source icon in the tag editor:
- 🏪 Entity default
- 📋 Correction rule (with pattern tooltip)
- 🤖 AI suggested

### Transfer Pairing
Transfers between accounts create two transactions (debit + credit) linked via `related_transaction_id`. The import pipeline's `match-transfers` script identifies and links these pairs by matching amount + date across accounts.

## Business Rules

1. **Amount sign convention:** Positive = money in (income, transfer received). Negative = money out (expense, transfer sent).
2. **Entity denormalisation:** `entity_name` is stored alongside `entity_id` to avoid a join on every list query. Must be kept in sync when an entity is renamed.
3. **Tag deduplication:** Duplicate tags within a transaction are prevented at the application level.
4. **Date format:** Always ISO 8601 (YYYY-MM-DD). No timezone — transactions are date-level, not datetime-level.
5. **Account names:** Free-form text, not normalised. Convention: "Bank Name Account Type" (e.g., "Up Everyday", "ANZ Savings", "Amex Platinum").

## Volume

- ~15,000+ transactions across 11 accounts (from Notion migration)
- Growing by ~100-200 transactions per month (imported from bank feeds)
