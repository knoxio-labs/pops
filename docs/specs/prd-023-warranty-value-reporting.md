# PRD-023: Warranty, Value & Reporting

**Epic:** [05 — Warranty, Value & Reporting](../themes/inventory/epics/05-warranty-value-reporting.md)
**Theme:** Inventory
**Status:** Draft

## Problem Statement

The inventory has replacement values, resale values, warranty dates, and location data — but none of it is surfaced meaningfully. The user can't answer "what's my total asset value?", "what's in the bedroom and what's it worth?", or "which warranties are expiring?" without manually scanning the item list. These are the queries that make the inventory useful beyond "where is my stuff?"

## Goal

A dashboard with total asset value, warranty expiry alerts, and value breakdowns. Insurance-ready reports that list everything in a room with values, photos, and linked receipts — exportable as printable HTML.

## Requirements

### R1: Inventory Dashboard Enhancement

Enhance the inventory home page (`/inventory`) with summary widgets above the item list:

**Widgets:**
- **Total replacement value** — sum of all items' `replacement_value`. Prominent, large number. e.g., "$42,350"
- **Total resale value** — sum of all items' `resale_value`. Smaller, secondary. e.g., "Est. resale: $18,200"
- **Item count** — total items in the inventory
- **Warranties expiring soon** — count of items with warranties expiring within 90 days. Click → filtered list
- **Recently added** — last 5 items added (by `created_at`)

**Data source:** `inventory.reports.dashboard` tRPC query — returns all summary values in one call.

### R2: Value Breakdown by Room

**On the inventory home page or a dedicated "Values" tab:**

- Bar chart or table showing replacement value per root location (room):
  ```
  Living Room    $15,200  ████████████████
  Bedroom         $8,400  █████████
  Kitchen         $3,800  ████
  Office         $12,100  ████████████
  Main Balcony    $2,850  ███
  ```
- Click a room → shows items in that room sorted by value
- Total at the bottom

**Data source:** `inventory.reports.valueByLocation({ depth?: number })` — aggregates replacement_value grouped by location at a specified depth (default: room level = depth 2 under "Home").

### R3: Value Breakdown by Type

Same visualisation as R2 but grouped by item type:

```
Electronics    $22,500  ██████████████████████
Appliances      $8,200  █████████
Furniture       $5,400  ██████
Kitchenware     $3,100  ███
Tools           $1,800  ██
Cables            $350  ▌
```

**Data source:** `inventory.reports.valueByType`

### R4: Warranty Tracking

**"Warranties" section on dashboard (or dedicated `/inventory/warranties` page):**

**Expiring soon (next 90 days):**
- List of items with warranties expiring within 90 days
- Each shows: item name, asset ID, warranty expiry date, days remaining, replacement value
- Sorted by expiry date (soonest first)
- Colour-coded: red (<30 days), yellow (30-60 days), orange (60-90 days)

**Expired:**
- Collapsible section showing items with expired warranties
- Same fields, muted styling
- "Expired X days ago" instead of "X days remaining"

**Active warranties:**
- Collapsible section showing items with warranties expiring >90 days from now
- "Expires in X months"

**On item detail page (PRD-019):**
- Warranty status indicator:
  - "Under warranty — expires in 45 days" (with colour)
  - "Warranty expired 120 days ago"
  - "No warranty" (if warranty_expires is null)

**Data source:** `inventory.reports.warranties({ threshold?: number })` — returns items grouped by warranty status.

### R5: Insurance Report

Generate a report for a location subtree — "everything in the bedroom and what it's worth."

**Entry points:**
- Location tree page (PRD-020): "Generate report" button per location
- Inventory home page: "Generate full report" button
- URL: `/inventory/report?locationId={id}` or `/inventory/report` (full)

**Report page layout:**

```
╔══════════════════════════════════════╗
║  POPS Home Inventory Report          ║
║  Location: Bedroom                   ║
║  Generated: 2026-03-20               ║
╠══════════════════════════════════════╣
║                                      ║
║  Summary                             ║
║  Items: 12                           ║
║  Total Replacement Value: $8,400     ║
║  Total Resale Value: $3,200          ║
║                                      ║
║  Items                               ║
║  ┌──────────────────────────────┐    ║
║  │ ROUTER01 — Asus Router       │    ║
║  │ Brand: Asus | Model: RT-AX86U│   ║
║  │ Condition: Excellent          │   ║
║  │ Purchased: 2025-06-15         │   ║
║  │ Warranty: expires 2027-06-15  │   ║
║  │ Replacement: $450             │   ║
║  │ Receipt: INV-2025-0042 ✓      │   ║
║  │ [photo thumbnail]             │   ║
║  └──────────────────────────────┘    ║
║  ┌──────────────────────────────┐    ║
║  │ ETHER04 — Ethernet cable 3m  │    ║
║  │ ...                           │   ║
║  └──────────────────────────────┘    ║
║  ...                                 ║
║                                      ║
║  Total Replacement Value: $8,400     ║
║  Total Resale Value: $3,200          ║
╚══════════════════════════════════════╝
```

**Per item in the report:**
- Item name, asset ID
- Brand, model
- Type, condition
- Purchase date
- Warranty status and expiry date
- Replacement value, resale value
- Primary photo (thumbnail)
- Linked Paperless-ngx documents (receipt IDs, if Epic 4 is complete)
- Location (full breadcrumb)

**Report features:**
- Printable: `@media print` CSS for clean printing
- "Print / Save as PDF" button (browser's native print → PDF)
- Include sub-locations toggle: "Bedroom only" vs "Bedroom and everything inside it"
- Sort by: value (highest first), name, type

**Data source:** `inventory.reports.generate({ locationId?, includeChildren?, sortBy? })`

### R6: Filtered Value Queries

The value summaries should be filterable by any combination:

- "Electronics in the Living Room" → filter by type=Electronics, location=Living Room subtree
- "Items under warranty in the Office" → filter by warranty active, location=Office
- "Deductible items" → filter by deductible=true

This is essentially the existing list filters (PRD-019 R3) with aggregation — total replacement value and total resale value shown for the filtered result set.

**Implementation:** Add `totalReplacementValue` and `totalResaleValue` to the list response when filters are applied. The frontend displays these alongside the filtered list.

### R7: Route Additions

```typescript
{ path: 'warranties', element: <WarrantiesPage /> },
{ path: 'report', element: <ReportPage /> },
```

Add "Warranties" to the inventory secondary navigation.
"Report" is accessed via buttons on location tree and home page — not primary navigation.

## Out of Scope

- Insurance claim submission workflow
- Depreciation calculations
- Historical value tracking over time
- Automated value estimation or price lookups
- Warranty renewal reminders via Moltbot/push notifications (AI Inference theme)
- Server-side PDF generation (use browser print-to-PDF)

## Acceptance Criteria

1. Dashboard shows total replacement value, total resale value, item count
2. Warranties expiring within 90 days listed with colour-coded urgency
3. Expired warranties shown separately
4. Warranty status shown on item detail pages
5. Value breakdown by room displayed as chart or table
6. Value breakdown by type displayed similarly
7. Insurance report generates for a location subtree with all item details
8. Report includes photos and Paperless-ngx document references (when available)
9. Report is printable with clean `@media print` CSS
10. "Include sub-locations" toggle works on reports
11. Filtered list shows aggregated values for the filtered set
12. Dashboard loads in a single API call (no N+1 queries)
13. All pages responsive
14. `mise db:seed` updated with varied warranty dates and replacement values
15. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**

### US-1: Inventory dashboard
**As a** user, **I want** to see total asset value and key stats at a glance **so that** I know the big picture.

**Acceptance criteria:**
- Total replacement value prominently displayed
- Item count, resale value, warranties expiring shown
- Recently added items
- Single API call for dashboard data

### US-2: Value breakdowns
**As a** user, **I want** to see asset value broken down by room and type **so that** I know where the value is concentrated.

**Acceptance criteria:**
- Value by room (chart or table)
- Value by type (chart or table)
- Click room → filtered item list

### US-3: Warranty tracking
**As a** user, **I want** to see which warranties are expiring soon **so that** I can plan extended warranty purchases or replacements.

**Acceptance criteria:**
- Items grouped by warranty status (expiring soon, expired, active)
- Colour-coded urgency
- Warranty status on item detail page

### US-4: Insurance report
**As a** user, **I want** to generate a report of everything in a room with values and photos **so that** I can give it to my insurer.

**Acceptance criteria:**
- Report for any location (room, sub-location, or full inventory)
- Each item shows: name, brand, model, values, purchase date, warranty, photo
- Receipt references included when available
- Printable with clean layout
- Include sub-locations toggle

### US-5: Filtered value queries
**As a** user, **I want** to see the total value of a filtered set of items **so that** I can answer "how much electronics do I have in the living room?"

**Acceptance criteria:**
- Total replacement and resale values shown for any filtered list
- Works with all existing filters (type, room, condition, in-use, deductible)
