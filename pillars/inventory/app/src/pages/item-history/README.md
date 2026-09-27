# Item history

`/inventory/items/:id/history` reads the item’s cursor-paged history from `GET /web/items/:id`. Pages are appended in server order; the visible list is grouped by UTC month and filtered locally into placement, detail, and lifecycle events.

Selecting an event opens its immutable before/after values, actor, timestamp, and reason. Undo calls the inventory event-revert mutation. The shared undo feedback reports success or a conflict and leaves the original event in the history.
