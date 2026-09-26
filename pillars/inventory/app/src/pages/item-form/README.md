# Item create / edit form

`/inventory/items/new` and `/inventory/items/:id/edit` use the same form
surface. `useItemForm` owns the draft reducer, catalogue and placement sources,
online code assistance, mutation commands, navigation guard, and Save and start
another state.

Create and edit saves use the inventory mutation protocol. An edit applies a
type change, item fields, placement, and code in dependency order so a refusal
preserves the draft and records the portion already applied. A successful
create navigates to the new item; Save and start another keeps the form open
with a fresh draft and shows the created item as a link.

The code field can suggest a value when the inventory service is available and
reports code collisions without discarding the user's input. The form talks
only to the inventory pillar through its generated client and mutation surface.
