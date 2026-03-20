# PRD-020: Location Tree Management

**Epic:** [02 — App Package & Edit UI](../themes/inventory/epics/02-app-package-ui.md)
**Theme:** Inventory
**Status:** Draft

## Problem Statement

The location tree is the backbone of "where is my stuff?" — but it needs a management UI for creating, organising, and maintaining the tree. The Notion import seeds the initial tree from Room + Location values, but the user needs to add new locations (a new drawer, a new shelf), reorganise (moved the router from bedroom to living room), and see what's at each location.

## Goal

A dedicated location tree management page where the user can visualise the full tree, add/rename/move/delete locations, see item counts per location, and drill into a location to see its contents.

## Requirements

### R1: Location Tree Page (`/inventory/locations`)

**Layout:**
- Full-screen tree view showing all locations hierarchically
- Each node shows: location name, item count badge, expand/collapse toggle
- Root nodes (Home, Car, Storage Cage) at the top level
- Expandable: click to show/hide children
- Selected location highlights and shows its contents in a side panel or below

**Interaction:**
- Click location name → select it, show items in that location
- Click expand toggle → show/hide children
- Double-click or edit icon → inline rename
- Drag-and-drop → move location (reparent)
- Right-click or menu → context menu (rename, add child, move, delete)

### R2: Add Location

**Entry points:**
- "Add location" button at the top of the tree page
- "Add child" action on any existing location (context menu or icon)
- Quick-add inline in the LocationPicker (PRD-019 R7)

**Flow:**
1. User clicks "Add child" on "Bedroom"
2. A new node appears as a child of Bedroom with an editable text field
3. User types "Nightstand"
4. Press Enter → `inventory.locations.create({ name: "Nightstand", parentId: bedroomId })`
5. New location appears in the tree

**Adding a root location:**
- "Add root location" button creates a new top-level node (parentId = null)
- Used for: adding "Office", "Friend's House", "Storage Cage"

### R3: Rename Location

- Double-click a location name → inline edit mode
- Or: right-click → "Rename" → inline edit
- Press Enter to save, Escape to cancel
- Calls `inventory.locations.update({ id, name })`

### R4: Move Location (Reparent)

Move a location and all its children to a new parent.

**Drag-and-drop:**
- Drag a location node → drop on another location → reparent
- Visual indicator showing where the node will be placed (as child of drop target)
- Can also drag to root level (reparent to null)

**Context menu fallback:**
- Right-click → "Move to..." → location picker modal
- Useful on mobile where drag-and-drop is harder

**Validation:**
- Can't move a location into its own subtree (circular reference)
- Moving a location moves all its children and all items at those locations

Calls `inventory.locations.update({ id, parentId: newParentId })`

### R5: Delete Location

- Right-click → "Delete" or delete icon
- **If location has items:** confirmation dialog: "This location contains X items. They will become unlocated. Continue?"
- **If location has children:** confirmation dialog: "This location has Y sub-locations (containing Z items total). All will be deleted. Items will become unlocated. Continue?"
- **If empty (no items, no children):** delete immediately with toast confirmation

Calls `inventory.locations.delete({ id, force: true })` after user confirmation.

### R6: Reorder Locations

Within a level, locations can be manually reordered.

- Drag-and-drop within the same parent → reorder (updates `sort_order`)
- Or: up/down buttons on each node (mobile-friendly)
- Default order: alphabetical. Manual reorder overrides.

### R7: Location Contents Panel

When a location is selected in the tree, show its contents:

**Side panel (desktop) or below the tree (mobile):**
- Location name as header with breadcrumb path
- List of items at this location (name, asset ID, type badge)
- Toggle: "Include items in sub-locations" → shows items from the entire subtree
- Item count and total replacement value for this location
- Click an item → navigate to item detail page
- "Add item here" button → navigate to item create form with location pre-selected

### R8: Responsive Design

| Viewport | Layout |
|----------|--------|
| Mobile (375px) | Full-width tree, contents panel below. Drag-and-drop disabled — use context menu for move. |
| Tablet (768px) | Side-by-side: tree on left (40%), contents on right (60%) |
| Desktop (1024px+) | Same side-by-side with more room |

### R9: Route

```typescript
{ path: 'locations', element: <LocationTreePage /> }
```

URL: `/inventory/locations`

Add "Locations" to the inventory app's secondary navigation.

## Out of Scope

- Batch item relocation (move 10 items to a new location at once)
- Location photos or descriptions
- Floor plan / map view of locations
- Location-based notifications ("you left something at Mum's")
- Auto-suggest locations based on item type

## Acceptance Criteria

1. Location tree displays all locations hierarchically with item counts
2. Locations can be added (as root or child) with inline editing
3. Locations can be renamed via double-click or context menu
4. Locations can be moved via drag-and-drop or "Move to..." dialog
5. Circular reparenting is prevented (can't move a location into its own subtree)
6. Locations can be deleted with appropriate confirmation dialogs
7. Locations can be reordered within a level
8. Selected location shows its items in a side panel
9. "Include sub-locations" toggle shows items from the full subtree
10. Item count and total value displayed per location
11. Page is responsive at all three breakpoints
12. Storybook stories for: LocationTree, LocationNode, LocationContentsPanel
13. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**

### US-1: View location tree
**As a** user, **I want** to see all my locations in a tree **so that** I understand how my space is organised.

**Acceptance criteria:**
- All locations displayed hierarchically
- Item counts shown per location
- Expandable/collapsible nodes

### US-2: Add locations
**As a** user, **I want** to add new locations to the tree **so that** I can organise new areas.

**Acceptance criteria:**
- Add root location
- Add child location to any existing location
- Inline text input for naming
- Location appears immediately in the tree

### US-3: Rename and reorder
**As a** user, **I want** to rename and reorder locations **so that** the tree stays accurate.

**Acceptance criteria:**
- Double-click to rename inline
- Drag to reorder within a level
- Changes persist after reload

### US-4: Move locations
**As a** user, **I want** to move a location (and its children) to a different parent **so that** I can reorganise.

**Acceptance criteria:**
- Drag-and-drop to reparent
- "Move to..." dialog as fallback
- Circular reference prevented
- Children and items move with the location

### US-5: Delete locations
**As a** user, **I want** to delete unused locations **so that** the tree stays clean.

**Acceptance criteria:**
- Confirmation when location has items or children
- Items become unlocated (not deleted)
- Empty locations delete immediately

### US-6: Browse location contents
**As a** user, **I want** to see what's at a location **so that** I can answer "what's in this drawer?"

**Acceptance criteria:**
- Select location → see items in side panel
- Toggle to include sub-location items
- Item count and total value shown
- Click item to navigate to detail page
