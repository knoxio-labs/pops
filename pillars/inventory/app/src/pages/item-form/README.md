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
Catalogue values are translated between stable form field IDs and protocol-1
field keys; edit patches include explicit clears so an emptied field is removed
from the item. Edit mutations start at the opening revision and advance their
base revision after each applied command.

Photos selected while creating are staged until the item save succeeds. Photos
selected while editing upload immediately through the content-addressed media
route, then attach through `item.attachPhoto`. The form keeps failed uploads in
the queue with their refusal reason and lets the user retry them; a photo
failure never rolls back an otherwise successful item save. Save and start
another waits for the queue, reports the number of attached photos, and then
clears the queue for the next item.
