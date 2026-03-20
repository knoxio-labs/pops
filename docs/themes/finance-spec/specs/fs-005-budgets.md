# FS-005: Budgets

## What It Is

Spending categories with period limits. Each budget defines a category (e.g., "Groceries"), a period (monthly or yearly), and an amount. Budgets are informational — they don't block spending or trigger alerts (yet). The data exists to support future dashboards, alerts, and spending analysis.

## Data Model

**Table:** `budgets`

| Field | Type | Purpose |
|-------|------|---------|
| `id` (notion_id) | TEXT PK | UUID, legacy from Notion import |
| `category` | TEXT | Budget category name (e.g., "Groceries", "Transport") |
| `period` | TEXT | "Monthly" or "Yearly" |
| `amount` | REAL | Spending limit for the period |
| `active` | INTEGER | Boolean — whether this budget is currently active |
| `notes` | TEXT | Free-form notes (nullable) |
| `last_edited_time` | TEXT | ISO timestamp |

## User Capabilities

### Browse
- Paginated list: category, period, amount, active toggle, notes
- Filter by: category search, active/inactive, period

### Create
- Form: category (required), period (Monthly/Yearly), amount, active, notes
- No uniqueness constraint on category — multiple budgets for the same category are allowed (e.g., a monthly and yearly grocery budget)

### Edit
- All fields editable
- Active toggle can be flipped inline

### Delete
- Confirmation required
- Hard delete

## Business Rules

1. **No spending tracking against budgets.** Budgets are currently just reference data — there's no "spent $450 of $800 Groceries budget this month" calculation. That requires joining budgets with transactions by tag/category matching, which is planned for the Finance Polish theme.
2. **Category is free-form text.** Not linked to tags or entities. The category name is just a label. Future: link budget categories to transaction tags for automatic spending calculation.
3. **Period is display-only.** "Monthly" and "Yearly" don't trigger any date-based logic. They indicate the intended cadence for the spending limit.
4. **Active flag.** Inactive budgets are hidden from default views but preserved in the database. Used for seasonal or temporary budgets.

## Current Limitations

- No actual budget vs. spending comparison
- No alerts when approaching or exceeding a budget
- No automatic period rollover (no "this month" vs "last month" tracking)
- No connection between budget categories and transaction tags

These are all planned for the Finance Polish theme.
