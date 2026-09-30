# Item create / edit form

`/inventory/items/new` and `/inventory/items/:id/edit` use the same form
surface. `/inventory/items/new?from=<id>` opens the create form as a copy of
that item: every value, override and photo is carried, and only the code
changes, since codes are unique. Its trailing number is bumped (padding kept)
and checked like a typed code; a code without one is left empty. `useItemForm` owns the draft reducer, catalogue and placement sources,
online code assistance, mutation commands, navigation guard, and Save and start
another state.

Create and edit saves use the published catalogue revision and stable field
IDs. Stored values are encoded by catalogue kind, while computed overrides use
the explicit override commands. An edit applies a type change, item fields,
computed overrides, placement, and code in dependency order so a refusal
preserves the draft and records the portion already applied. A successful create
navigates to the new item; Save and start another keeps the form open with a
fresh draft and shows the created item as a link.

The code field can suggest a value when the inventory service is available and
reports code collisions without discarding the user's input. The form talks
only to the inventory pillar through its generated client and mutation surface.
Catalogue values are translated between stable form field IDs and the typed
protocol-2 value contract; edit patches include explicit clears so an emptied
field is removed from the item. Edit mutations carry the published catalogue
revision, start at the opening item revision, and advance their base revision
after each applied command.

`item.create` carries neither computed overrides nor photos, so a create
applies them afterwards against the new item: overrides through the override
commands, a copy's photos by re-attaching their stored hashes. The item already
exists by then, so a refused follow-up is reported as not copied instead of
refusing the save, which would let a retry create the item twice.

Photos selected while creating are staged until the item save succeeds. Photos
selected while editing upload immediately through the content-addressed media
route, then attach through `item.attachPhoto`. The form keeps failed uploads in
the queue with their refusal reason and lets the user retry them; a photo
failure never rolls back an otherwise successful item save. Save and start
another waits for the queue, reports the number of attached photos, and then
clears the queue for the next item.
