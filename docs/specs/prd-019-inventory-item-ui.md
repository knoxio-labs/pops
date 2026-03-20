# PRD-019: Inventory App Package & Item UI

**Epic:** [02 — App Package & Edit UI](../themes/inventory/epics/02-app-package-ui.md)
**Theme:** Inventory
**Status:** Draft
**ADRs:** [002 — Shell Architecture](../architecture/adr-002-shell-architecture.md)

## Problem Statement

The current inventory UI is a read-only data table embedded in the finance app. Items can't be created, edited, or deleted from the UI. There's no detail page, no photo gallery, no asset ID search, no location browsing. The inventory needs its own app package with full CRUD capabilities.

## Goal

`@pops/app-inventory` workspace package with: a searchable/filterable item list (table and grid views), item detail pages with photos and connections, create/edit forms with a location tree picker, and fast asset ID lookup. Location tree management is a separate PRD (PRD-020).

## Requirements

### R1: Package Scaffold

Create `packages/app-inventory/`:

```
packages/app-inventory/
  package.json                (@pops/app-inventory)
  tsconfig.json
  src/
    index.ts
    routes.tsx
    pages/
      ItemListPage.tsx
      ItemDetailPage.tsx
      ItemFormPage.tsx          (create + edit, shared form)
    components/
      InventoryCard.tsx + stories
      InventoryTable.tsx + stories
      ItemDetail.tsx + stories
      ItemForm.tsx + stories
      PhotoGallery.tsx + stories
      PhotoUpload.tsx + stories
      ConnectionsList.tsx + stories
      AssetIdBadge.tsx + stories
      LocationBreadcrumb.tsx + stories
      LocationPicker.tsx + stories
      ConditionBadge.tsx + stories
      TypeBadge.tsx + stories
    hooks/
      useInventoryList.ts
      useItemDetail.ts
      useLocationTree.ts
```

### R2: Shell Integration

- Icon: Package/box icon (Lucide)
- Label: "Inventory"
- Route prefix: `/inventory`
- Lazy-loaded routes

### R3: Item List Page (`/inventory`)

**Layout:**
- Search bar: search by item name or asset ID (debounced, 300ms)
- Filter bar: type dropdown, condition dropdown, room dropdown (from location tree roots' children), in-use toggle, deductible toggle
- Sort options: name (A-Z), date added, replacement value, location
- View toggle: table view / grid view
- Total items count and total replacement value summary line

**Table view** (default):
- Columns: Asset ID, Name, Brand, Type, Condition, Location (breadcrumb), Value, In Use
- Sortable columns
- Click row → item detail page

**Grid view:**
- `InventoryCard` components in a responsive grid
- Each card shows: primary photo (or placeholder), name, asset ID badge, type badge, location breadcrumb
- Click card → item detail page

**Empty state:** "No items yet. Add your first item." with CTA button.

**Data source:** `inventory.items.list` tRPC query

### R4: Item Detail Page (`/inventory/items/:id`)

**Layout:**
- Header: item name, asset ID badge (prominent), type badge, condition badge
- Photo gallery: grid of item photos, click to expand/lightbox. "Add photo" button.
- Metadata section:
  - Brand, Model
  - Location breadcrumb (clickable → location tree page)
  - In use / Deductible flags
  - Purchase date, Warranty status (with days remaining or "Expired")
  - Replacement value, Resale value
  - Purchased from (entity link → finance)
  - Purchase transaction (link → finance transaction detail)
- Notes section: rendered markdown
- Connections section: list of connected items with asset ID, name, type badge. Each links to its detail page. "Connect to..." button. Expand to show connection chain (placeholder for Epic 3).
- Documents section: placeholder for Paperless-ngx links (Epic 4)
- Actions: Edit button, Delete button (with confirmation)

**Data source:** `inventory.items.get` with location breadcrumb, connections, photos

### R5: Item Create/Edit Form (`/inventory/items/new`, `/inventory/items/:id/edit`)

Shared form component used for both create and edit.

**Fields:**
- Item name (required, text)
- Asset ID (optional, text, validated unique on blur)
- Brand (optional, text)
- Model (optional, text)
- Type (select: Cable, Appliance, Clothing, Plant, Furniture, Electronics, Kitchenware, Tool, Decor)
- Condition (select: New, Excellent, Good, Fair, Poor)
- Location (LocationPicker — tree selector, see R7)
- In use (checkbox)
- Deductible (checkbox)
- Purchase date (date picker)
- Warranty expires (date picker)
- Est. replacement value (number, AUD)
- Est. resale value (number, AUD)
- Notes (textarea with markdown preview toggle)
- Photos (PhotoUpload component — drag-and-drop or file picker)

**Behaviour:**
- Create: `inventory.items.create` mutation, navigate to detail page on success
- Edit: pre-filled form, `inventory.items.update` mutation, navigate to detail page on success
- Asset ID uniqueness validated on blur (check via API before submit)
- Toast notifications on success/error
- Unsaved changes warning on navigation away

### R6: Photo Gallery Component

**On detail page:**
- Grid of photos (2-3 per row on mobile, 4-5 on desktop)
- Click photo → lightbox overlay with full-size image, prev/next navigation
- First photo is the primary/thumbnail (shown on cards)

**On edit page:**
- Same grid with drag-to-reorder
- "Add photo" button: file picker or camera capture on mobile
- Delete button per photo (with confirmation)
- Upload shows progress indicator

### R7: Location Picker Component

A tree selector for choosing an item's location in create/edit forms.

**UX:**
- Button shows current selection as breadcrumb: "Home > Bedroom > Wardrobe Right Door"
- Click opens a tree overlay/modal
- Tree is expandable (click to expand/collapse children)
- Search/filter: type to filter locations by name
- Click a location to select it
- "Clear" button to set location to null (unlocated)
- "Add location" inline option (quick-add a new location without leaving the form)

### R8: Asset ID Search

Fast lookup by asset tag — the primary way to find items in daily use.

- Search bar on the list page accepts asset IDs
- Exact match on asset ID returns the item immediately (no need to scroll through results)
- If the search term matches an asset ID exactly, navigate directly to that item's detail page (or highlight it in the list)
- Asset ID search is case-insensitive

### R9: Image Serving Endpoint

Express route for serving inventory photos:

**Route:** `GET /inventory/images/:itemId/:filename`

- Serves from `{INVENTORY_IMAGES_DIR}/items/{itemId}/{filename}`
- `Cache-Control: public, max-age=31536000, immutable`
- Generated placeholder for items with no photos (item name on coloured background, type-based colour)
- Same pattern as media image serving (PRD-008 R7)

### R10: Responsive Design

All pages and components at three breakpoints:

| Breakpoint | Grid columns | List view |
|-----------|-------------|-----------|
| 375px (mobile) | 2 cards | Simplified table (name, asset ID, type) |
| 768px (tablet) | 3 cards | Full table |
| 1024px+ (desktop) | 4-5 cards | Full table |

- Detail page: stacked on mobile, side-by-side on tablet+
- Photo gallery: 2 columns on mobile, 4+ on desktop
- Location picker: full-screen modal on mobile, popover on desktop

## Out of Scope

- Location tree management page (PRD-020)
- Connection graph visualisation (PRD-021)
- Paperless-ngx document linking UI (PRD-022 — placeholder shown)
- Warranty alerts or value reports (PRD-023)
- Batch import/edit
- Bulk operations (multi-select, bulk move, bulk delete)

## Acceptance Criteria

1. `packages/app-inventory/` exists as a workspace package
2. Inventory appears in the shell app switcher
3. Item list page with search, filter, sort, and table/grid toggle
4. Asset ID search finds items by exact tag match
5. Item detail page displays all metadata, photos, connections, notes
6. Item create form creates items with all fields including location picker
7. Item edit form pre-fills and updates correctly
8. Photo gallery with lightbox on detail page
9. Photo upload with compression on edit page
10. Location picker shows tree, supports search, allows quick-add
11. Delete with confirmation dialog
12. All pages responsive at 375px, 768px, 1024px
13. Storybook stories for all new components
14. `pnpm typecheck` and `pnpm test` pass
15. No regressions in other apps

## User Stories

> **Standard verification — applies to every US below.**

### US-1: Package scaffold and shell integration
**As a** developer, **I want** `@pops/app-inventory` plugged into the shell **so that** users can navigate to the inventory app.

**Acceptance criteria:**
- Package exists, builds, appears in app switcher
- Lazy-loaded routes

### US-2: Item list page
**As a** user, **I want** to browse all my items with search and filters **so that** I can find what I'm looking for.

**Acceptance criteria:**
- Table and grid views with toggle
- Search by name or asset ID
- Filter by type, condition, room, in-use
- Sort by name, date, value, location
- Total count and value summary

### US-3: Item detail page
**As a** user, **I want** to see full details for an item **so that** I know everything about it.

**Acceptance criteria:**
- All metadata, photos, connections, notes displayed
- Location as clickable breadcrumb
- Warranty status with days remaining
- Edit and delete actions

### US-4: Item create/edit form
**As a** user, **I want** to add and edit items from the UI **so that** I don't need to use the API directly.

**Acceptance criteria:**
- All fields including location picker
- Asset ID uniqueness validation
- Create navigates to new item's detail page
- Edit pre-fills form with current values
- Unsaved changes warning

### US-5: Photo gallery and upload
**As a** user, **I want** to view and manage photos for an item **so that** I have a visual record.

**Acceptance criteria:**
- Grid gallery with lightbox on detail page
- Upload with compression on edit page
- Drag-to-reorder photos
- Camera capture on mobile
- Delete individual photos

### US-6: Location picker
**As a** user, **I want** to pick a location from a tree **so that** items are placed in the correct spot.

**Acceptance criteria:**
- Tree overlay with expand/collapse
- Search to filter by name
- Breadcrumb display of selection
- Quick-add new location inline
- Clear to set no location

### US-7: Asset ID search
**As a** user, **I want** to search by asset tag **so that** I can find items by their physical label.

**Acceptance criteria:**
- Exact asset ID match returns result immediately
- Case-insensitive
- Works from the list page search bar
