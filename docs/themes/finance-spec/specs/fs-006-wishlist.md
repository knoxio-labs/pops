# FS-006: Wishlist

## What It Is

Savings goals for aspirational purchases. Each item has a target amount and a "saved" amount that the user manually updates as they save toward it. A progress bar shows how close they are to the goal.

## Data Model

**Table:** `wish_list`

| Field | Type | Purpose |
|-------|------|---------|
| `id` (notion_id) | TEXT PK | UUID, legacy from Notion import |
| `item` | TEXT | What they're saving for (e.g., "New Gaming PC") |
| `target_amount` | REAL | Total cost of the item |
| `saved` | REAL | Amount saved so far |
| `priority` | TEXT | "Needing", "Soon", "One Day", "Dreaming" |
| `url` | TEXT | Product link (nullable) |
| `notes` | TEXT | Free-form notes (nullable) |
| `last_edited_time` | TEXT | ISO timestamp |

## User Capabilities

### Browse
- Paginated list: item, priority (badge), target, saved, progress bar, URL (link), notes
- Filter by: item name search, priority
- Progress visualised as a bar (saved / target_amount × 100%)

### Create
- Form: item (required), target amount, saved (default 0), priority, URL, notes

### Edit
- All fields editable
- Primary use: updating the "saved" amount as contributions are made

### Delete
- Confirmation required
- Hard delete

## Business Rules

1. **Priority levels:** "Needing" > "Soon" > "One Day" > "Dreaming" (urgency order). Display-only — no automatic prioritisation.
2. **Progress calculation:** `saved / target_amount × 100%`. Clamped to 0-100% for display.
3. **Manual tracking:** The "saved" field is updated manually by the user. There's no automatic link to bank transactions or savings accounts. Future: link to a dedicated savings account and auto-track.
4. **No notifications.** No "you're 90% there!" alerts. Planned for AI Inference theme.

## Current Limitations

- No link to actual bank account balances
- No automatic progress tracking from transactions
- No target date or savings rate calculation
- No "purchase complete" workflow (just delete the item when bought)
