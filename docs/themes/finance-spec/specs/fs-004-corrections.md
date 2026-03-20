# FS-004: Corrections (Learned Tagging Rules)

## What It Is

A rule engine that learns from user corrections. When a user changes a transaction's entity, tags, or type during import review or manual editing, the correction can be saved as a reusable rule. Future transactions matching the same pattern are automatically tagged without user intervention.

This is the "system learns from you" mechanism — corrections are the primary way the app improves over time.

## Data Model

**Table:** `transaction_corrections`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | TEXT PK | Hex UUID |
| `description_pattern` | TEXT | The pattern to match against transaction descriptions |
| `match_type` | TEXT | "exact", "contains", or "regex" |
| `entity_id` | TEXT FK | Entity to assign when matched (nullable) |
| `entity_name` | TEXT | Denormalised entity name |
| `location` | TEXT | Location to assign (nullable) |
| `tags` | TEXT | JSON array of tags to suggest |
| `transaction_type` | TEXT | Type to assign: "income", "expense", "transfer" (nullable) |
| `confidence` | REAL | 0.0 to 1.0 — how reliable this rule is |
| `times_applied` | INTEGER | Counter — how many times this rule has been used |
| `created_at` | TEXT | ISO timestamp |
| `last_used_at` | TEXT | ISO timestamp of last application |

**View:** `v_active_corrections` — filters to rules with `confidence >= 0.7`

## How Matching Works

When the system needs to suggest tags for a transaction description, it checks corrections in this order:

1. **Exact match** — `description_pattern` exactly matches the description (case-insensitive)
2. **Contains match** — `description_pattern` is found within the description
3. **Regex match** — `description_pattern` is a regex that matches the description

Within each match type, rules are ranked by:
1. Confidence (highest first)
2. Times applied (most used first)

Only active rules (confidence ≥ 0.7) are used for automatic suggestion. Lower-confidence rules exist in the database but aren't applied until their confidence is raised.

## User Capabilities

### Browse Rules
- Paginated table: pattern, match type, entity, confidence (%), times applied, created, last used
- Confidence colour-coded: red (<50%), yellow (50-70%), green (>70%)

### Create/Edit Rules
- Form: description pattern, match type, entity (autocomplete), location, tags (chip input), transaction type, confidence
- Create or update (upsert by description_pattern)

### Adjust Confidence
- +/- buttons on each rule in the table
- Increment/decrement by 0.1
- Clamped to 0.0-1.0 range
- Purpose: user feedback loop — if a rule keeps producing wrong results, lower its confidence. If it's consistently right, raise it.

### Delete Rules
- Remove a rule entirely

### Batch Generate Rules
- "Generate Rules" button
- Sends a batch of recent transactions to Claude Haiku
- AI analyzes patterns and proposes reusable rules
- Returns proposals only — user must review and accept each one
- Up to 50 transactions per batch (Claude context limit)

## Business Rules

1. **Confidence threshold:** Only rules with confidence ≥ 0.7 are auto-applied. Below that, they exist but don't fire.
2. **Starting confidence:** New rules start at 0.5 (below the auto-apply threshold). They need positive feedback to reach 0.7.
3. **Confidence decay:** No automatic decay. Confidence only changes via explicit user action (adjust buttons).
4. **Tag priority:** Correction rule tags take priority over entity default tags. If a correction says `["Groceries", "Weekly Shop"]` and the entity default says `["Groceries"]`, the correction's tags win.
5. **Upsert behaviour:** Creating a rule with an existing `description_pattern` updates the existing rule rather than creating a duplicate.
6. **Times applied counter:** Incremented each time the rule is used to suggest tags. Not decremented. Informational only.

## Integration Points

- **Import pipeline:** Corrections are checked during the tag suggestion step (Step 5). Matched rules suggest tags with "📋 Rule" source attribution.
- **Transaction tag editor:** The "Suggest Tags" button on any transaction checks corrections as one of the tag sources.
- **AI rule generation:** Claude proposes rules based on transaction patterns. The user reviews and accepts, which creates correction entries.
