# Location tree management

`/inventory/locations`. Two panes: the location tree on the left, the contents of
the selected location on the right. The tree is fetched once as a nested tree
(`GET /locations/tree`) and flattened into a `nodeMap` that every handler reads.

## Drag precedence

`useDragHandlers.ts` decides between reorder and reparent by comparing parents,
not by drop position:

- Drop onto a node with the **same** `parentId` → reorder. The sibling array is
  reindexed 0..n and one `PATCH /locations/:id` fires per sibling whose
  `sortOrder` actually changed. A node therefore cannot be nested under one of
  its own siblings by dropping onto it.
- Drop onto a node with a **different** `parentId` → reparent
  (`PATCH { parentId }`) and nothing else. No `sortOrder` is sent and
  `updateLocation` only writes the fields it was given, so the node keeps
  whatever `sortOrder` it had. Children come back ordered by
  `(sortOrder, name)`, so the moved node lands wherever that puts it among its
  new siblings — commonly first, not last.
- Drop into the dragged node's own subtree → refused client-side by
  `isDescendant` before any request. The server also refuses (409), which is what
  the Move dialog's disabled entries prevent reaching.

The coarse-pointer arrow buttons take a different path: they swap the two
neighbours' `sortOrder` values rather than reindexing the row. Pointer
affordances are pure CSS (`[@media(pointer:fine)]` drag handle,
`[@media(pointer:coarse)]` arrows) — both are always rendered, nothing is
feature-detected in JS.

## Delete is a two-phase handshake

The first `DELETE /locations/:id` is sent without `force`. A location with
children or items answers **200** with `{ requiresConfirmation: true, stats }` —
a success, not an error — and `useLocationMutations` opens the dialog from those
stats. Confirming re-issues the same call with `force=true`.

What that second call actually removes is one row. `deleteLocation` in
`src/db/services/locations.ts` is a single-row delete; `locations.parent_id`
carries no foreign key, so descendant rows survive with a dangling parent, and
`getLocationTree` promotes any node whose parent is missing to a root — an
orphaned subtree reappears at the top of the tree. Items pointing directly at the
deleted row are unlocated by the `home_inventory.location_id` FK
(`ON DELETE SET NULL`); items in the surviving descendants keep their location.
The dialog copy in `sections/DeleteDialog.tsx` ("They will all be deleted")
describes an intent the server does not implement.

## Contents panel

With "include sub-locations" on it does **not** use the server's
`includeChildren` filter: `components/location-contents-panel-data.ts` issues
one `GET /items?locationId=&limit=200` per descendant location in parallel and
concatenates the results client-side.
