# PRD-018: Notion Inventory Import

**Epic:** [01 — Notion Import](../themes/inventory/epics/01-notion-import.md)
**Theme:** Inventory
**Status:** Draft

## Problem Statement

The real inventory data lives in Notion — dozens of items with metadata, photos, custom IDs, and "Used By" relationships. Manually re-entering this into POPS would be tedious and error-prone. A one-time import script migrates everything from Notion to POPS, after which Notion is retired as the inventory source of truth.

## Goal

A `mise import:notion-inventory` task that fetches all items from the Notion Home Inventory database, maps them to the POPS schema, downloads photos, creates the location tree, builds item connections, and links cross-domain references (transactions, entities). Dry-run mode shows what would be imported without writing.

## Requirements

### R1: Notion API Client for Inventory

Use the existing Notion MCP connection or build a lightweight client targeting the inventory database.

**Data source:** `collection://7784d712-0114-4371-90c1-cb15ea003fe2`

**For each item, fetch:**
- All properties (Item Name, Brand, Model, ID, Room, Location, Type, Condition, In-use, Deductible, Purchase Date, Warranty Expires, Est. Replacement Value, Est. Resale Value, Used By, Purchase Transaction, Purchased From)
- Page content (for specs/notes and embedded photos)
- Page files/images

### R2: Property Mapping

| Notion Property | POPS Field | Mapping |
|----------------|-----------|---------|
| Item Name | `name` | Direct copy |
| Brand/Manufacturer | `brand` | Direct copy |
| Model | `model` | Direct copy |
| ID | `asset_id` | Direct copy (e.g., "CAPIVARA" → "CAPIVARA") |
| Room | `location_id` | Look up or create in locations tree |
| Location | `location_id` | Create as child of Room location |
| Type | `type` | Direct copy (enum values match) |
| Condition | `condition` | Direct copy (enum values match) |
| In-use | `in_use` | `__YES__` → 1, else 0 |
| Deductible | `deductible` | `__YES__` → 1, else 0 |
| Purchase Date | `purchase_date` | ISO date string |
| Warranty Expires | `warranty_expires` | ISO date string |
| Est. Replacement Value | `replacement_value` | Number |
| Est. Resale Value | `resale_value` | Number |
| Used By | → `item_connections` | Match by item name (see R4) |
| Purchase Transaction | `purchase_transaction_id` | Match Notion relation → POPS transaction (see R5) |
| Purchased From | `purchased_from_id` + `purchased_from_name` | Match Notion relation → POPS entity (see R5) |
| Page content | `notes` | Convert Notion blocks to markdown |
| Notion page ID | `notion_id` | Store for dedup and verification |

### R3: Location Tree Creation

Build the location tree from unique Room + Location combinations:

1. Create "Home" as a root location (if not exists)
2. For each unique `Room` value: create as child of "Home"
3. For each unique `Location` value within a room: create as child of that room
4. Set `location_id` on each item to the most specific location available (Location if set, else Room, else "Home")

**Example:** Room="Living Room", Location="TV Unit - Left Door" →
```
Home → Living Room → TV Unit - Left Door
```

Items with no Room or Location get `location_id = NULL`.

### R4: "Used By" as Notes (Connections Deferred)

The Notion "Used By" field is a multi-select with device display names (e.g., "Capivara", "TV", "Sonos Arc"). Automatically matching these to POPS items is unreliable — names are informal, items may not have asset IDs yet, and partial matching produces false positives.

**Approach:** Append "Used By" values to the item's `notes` field during import:
```
## Connected to (from Notion)
- Capivara
- TV
- Sonos Arc
```

This preserves the information for manual connection creation later (Epic 3). The user will go through items and create proper bidirectional connections using the connection UI once the full inventory is in POPS with asset IDs assigned.

No `item_connections` rows are created during import.

### R5: Cross-Domain Reference Matching

**Purchase Transaction:**
- Notion stores this as a relation to the Balance Sheet database
- Fetch the related Notion page, extract its description/amount/date
- Match to a POPS transaction by: description + amount + date, or by `notion_id` if the transaction was imported from Notion
- Set `purchase_transaction_id` if matched, log if unmatched

**Purchased From:**
- Notion stores this as a relation to the Entities database
- Fetch the related Notion page, extract the entity name
- Match to a POPS entity by name (case-insensitive)
- Set `purchased_from_id` and `purchased_from_name` if matched

### R6: Photo Download

Notion embeds images in page content as signed S3 URLs that expire after ~1 hour.

**Download strategy:**
1. Fetch page content for each item
2. Parse content for image URLs (Notion's `prod-files-secure.s3.us-west-2.amazonaws.com` URLs)
3. Download each image immediately (URLs expire)
4. Compress: resize to max 1920px, convert HEIC to JPEG, strip EXIF
5. Store in `{INVENTORY_IMAGES_DIR}/items/{item_id}/photo_{NNN}.jpg`
6. Create `item_photos` rows with sort order matching the page content order

**Not all items have photos.** The import should handle items with zero, one, or multiple photos gracefully.

### R7: Notes Extraction

Notion page content (beyond images) should be extracted as markdown for the `notes` field.

**Conversion:**
- Headings → markdown headings
- Bullet lists → markdown lists
- Bold/italic → markdown formatting
- Code blocks → markdown code blocks
- Images → excluded (handled separately as photos)
- Empty pages → `notes = NULL`

The Notion API returns content as blocks. Use a block-to-markdown converter (or write a simple one — the block types used in inventory pages are limited).

### R8: Dry-Run Mode

`mise import:notion-inventory` without `--execute` runs in dry-run mode:

**Report output:**
```
=== Notion Inventory Import (Dry Run) ===

Items found: 87
Location tree:
  Home (root)
    Living Room (23 items)
      TV Unit - Left Door (8 items)
      TV Unit - Right Drawer (3 items)
      Bar (2 items)
    Bedroom (12 items)
      Wardrobe Right Door (5 items)
    ...

Items with photos: 14 (32 photos total)
Items with notes: 8
Items with "Used By": 34 (values preserved in notes for manual connection)

Cross-domain links:
  Purchase Transaction: 3 matched, 0 unmatched
  Purchased From: 5 matched, 1 unmatched

Estimated photo download size: ~45 MB

Run with --execute to import.
```

### R9: Idempotency

The import should be safe to run multiple times:

- Check `notion_id` before inserting — skip items that already exist in POPS
- Update existing items if re-run (optional `--update` flag)
- Don't duplicate locations, connections, or photos on re-run

## Out of Scope

- Ongoing Notion sync (one-time import only)
- Writing back to Notion
- Importing from other Notion databases (entities, transactions — those are already in POPS)
- UI for the import (CLI only)

## Acceptance Criteria

1. All items from Notion Home Inventory are imported with correct property mapping
2. Location tree is auto-created from Room + Location combinations
3. "Used By" values are appended to item notes for manual connection creation later
5. Photos are downloaded, compressed, and stored locally
6. Notes are extracted from page content as markdown
7. Cross-domain references (transactions, entities) matched where possible
8. Dry-run mode produces an accurate report without writing
9. Import is idempotent — safe to re-run
10. `notion_id` stored on each imported item for traceability
11. Import log shows total/imported/skipped/error counts
12. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**

### US-1: Notion data fetch
**As a** developer, **I want** to fetch all items from the Notion inventory database **so that** I can map them to the POPS schema.

**Acceptance criteria:**
- All items fetched with all properties
- Page content fetched for photos and notes
- Handles pagination (Notion API returns max 100 items per request)

### US-2: Property mapping and item creation
**As a** developer, **I want** Notion properties mapped to POPS fields **so that** items are created with correct data.

**Acceptance criteria:**
- All fields mapped per R2 table
- Enum values (Type, Condition) mapped correctly
- Boolean fields (In-use, Deductible) converted from Notion format
- Dates converted to ISO strings

### US-3: Location tree auto-creation
**As a** developer, **I want** the location tree built from Notion Room + Location values **so that** items have correct hierarchical locations.

**Acceptance criteria:**
- "Home" root created
- Unique rooms created as children of Home
- Unique locations created as children of their rooms
- Items linked to most specific location
- Duplicate locations not created on re-run

### US-4: "Used By" preservation
**As a** developer, **I want** "Used By" values preserved in item notes **so that** connections can be created manually later.

**Acceptance criteria:**
- "Used By" values appended to notes as a markdown list
- Formatted under a "Connected to (from Notion)" heading
- Items with no "Used By" values have no extra notes content
- Existing notes content (specs, etc.) is preserved above the connection list

### US-5: Photo download
**As a** developer, **I want** photos downloaded from Notion pages **so that** item images are preserved in POPS.

**Acceptance criteria:**
- Images downloaded immediately (before URL expiry)
- Compressed and stored locally
- HEIC converted to JPEG
- item_photos rows created with correct ordering
- Items with no photos handled gracefully

### US-6: Dry-run mode
**As a** user, **I want** to preview the import without writing **so that** I can verify before committing.

**Acceptance criteria:**
- Full report: item count, location tree, photo count, match stats
- No database writes in dry-run mode
- Estimated photo download size shown
