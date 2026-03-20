# FS-002: Import Pipeline

## What It Is

A 6-step wizard for importing bank transactions from CSV files into POPS. The pipeline handles parsing, deduplication, entity matching, tag suggestion, and user review before committing data. It's the primary data entry mechanism — most transactions enter the system through imports, not manual creation.

## Supported Banks

| Bank | Format | Status |
|------|--------|--------|
| ANZ | CSV download | Stub (needs migration from legacy script) |
| Amex | CSV download | Stub |
| ING | CSV download | Stub |
| Up Bank | API (webhook + batch) | Stub |

All bank scripts share the same core pipeline (entity matching, deduplication, tag suggestion). Bank-specific logic is limited to CSV column mapping and description normalisation.

## The 6-Step Wizard

### Step 1: Upload
- User selects a CSV file
- File parsed with Papa Parse (client-side)
- Raw rows and column headers extracted
- Validation: file must contain at least date, description, and amount columns

### Step 2: Column Map
- User maps CSV column headers to standard fields: date, description, amount, account
- Account name can be set globally (if not in the CSV) or mapped from a column
- Preview of mapped data shown (first 5 rows)
- Validation: all required fields must be mapped

### Step 3: Processing
- Mapped transactions sent to the backend: `imports.processImport`
- Backend runs asynchronously — UI polls `imports.getImportProgress` every 1 second
- Processing per transaction:
  1. **Deduplication** — check if this (date, amount) pair already exists in the DB
  2. **Entity matching** — 5-stage match + AI fallback (see Entity Matching below)
  3. **Tag suggestion** — from entity defaults, correction rules, or AI
- Progress shown: "Processing 45/120 transactions..."
- Each transaction classified as: matched, uncertain, failed, or skipped (duplicate)

### Step 4: Review
- Transactions grouped by entity
- Each group shows: entity name (or "Unknown"), transaction count, total amount
- Per transaction: date, description, amount, matched entity, confidence
- User can:
  - Accept the match (keep suggested entity)
  - Change the entity (autocomplete selector)
  - Create a new entity inline (EntityCreateDialog)
  - Mark as skipped
- "Uncertain" matches highlighted for attention

### Step 5: Tag Review
- For each transaction, suggested tags shown with source attribution
- User can:
  - Accept suggested tags
  - Remove individual tags
  - Add new tags (autocomplete from known tags)
- Tag source icons: 🏪 Entity, 📋 Rule, 🤖 AI
- Bulk "Accept All" to accept all suggestions at once

### Step 6: Summary
- Final counts: total, importing, skipped (duplicates), new entities created
- Warnings: AI failures, ambiguous matches, missing entities
- "Import" button commits to SQLite via `imports.executeImport`
- Progress shown during write
- On completion: success message with final counts

## Entity Matching (5-Stage)

The entity matcher resolves raw bank descriptions to known entities. Stages run in order; first match wins.

### Stage 1: Manual Aliases
Hardcoded per-bank mappings for descriptions that are consistently different from the entity name.
- Example: "WOOLWORTHS 1234 SYDNEY" → "Woolworths"
- Maintained as a JSON map per bank

### Stage 2: Exact Match
Case-insensitive comparison against all entity names in `entity_lookup.json`.
- "Woolworths" matches entity "Woolworths"

### Stage 3: Prefix Match
Description starts with an entity name (longest match wins).
- "SHELL COLES EXPRESS MARRICKVILLE" matches "Shell" (not "Coles" — Shell is a prefix)

### Stage 4: Contains Match
Entity name found anywhere in the description (minimum 4 characters, longest match wins).
- "PAYMENT TO NETFLIX.COM" matches "Netflix"

### Stage 5: Punctuation Stripping
Remove apostrophes from both description and entity names, then retry stages 2-4.
- "MCDONALD'S" → "MCDONALDS" → matches "McDonald's"

### Stage 6: AI Fallback
If no match found, send the description to Claude Haiku.
- Prompt: extract merchant name and category from the description
- Response cached to disk (`ai_entity_cache.json`) keyed by uppercase description
- Cost: ~$0.001-$0.005 per unique description
- Cache hit rate: ~90%+ after initial import (most descriptions repeat)

**Hit rate:** Stages 1-5 match ~95-100% of transactions. AI handles the remaining ~5%.

## Deduplication

Deduplication prevents re-importing transactions that are already in the database.

**Strategy:** Date + amount count-based.
1. Group incoming transactions by `(date, amount)` tuple
2. For each group, count how many records already exist in SQLite with the same `(date, amount)`
3. If incoming count ≤ existing count → all are duplicates, skip
4. If incoming count > existing count → import the difference (extra ones are new)

**Why count-based:** A user might have two $50.00 transactions on the same day (lunch and dinner). The first import creates 2 records. A re-import of the same CSV finds 2 incoming and 2 existing → 0 new. If a third $50.00 transaction actually occurred, the next import finds 3 incoming and 2 existing → 1 new.

**Limitation:** This can't distinguish *which* specific transaction in a group is the duplicate. It assumes order doesn't matter — only the count matters.

## AI Categorisation Integration

The import pipeline uses AI categorisation as a fallback:
- Only called when stages 1-5 fail to match
- Each call tracked in `ai_usage` table (cost, tokens, cache status)
- Cache prevents re-calling for the same description
- If AI fails (timeout, error, rate limit), the transaction is marked as "uncertain" for manual review
- Exponential backoff on 429 errors (max 5 retries)

## Background Processing

Import processing runs asynchronously:
- `processImport` returns a session ID immediately
- Processing happens in the background
- UI polls `getImportProgress` every 1 second
- Progress includes: status, current step, processed count, batch results, errors
- `executeImport` (final write) is synchronous and atomic (SQLite transaction)

## State Management

The import wizard uses a Zustand store to track:
- Current step (1-6)
- Uploaded file and parsed rows
- Column mappings
- Processing session ID and results
- User-confirmed transactions (after review)
- Tag assignments

State persists across steps but is lost on page refresh (no persistence to localStorage or DB).
