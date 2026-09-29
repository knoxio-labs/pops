# Item history

`/inventory/items/:id/history` reads the item’s cursor-paged history from `GET /web/events?entityId=:id`. The filter is URL-backed through `kind`, so the server returns the selected event family and its authoritative counts; the visible list is grouped by UTC month in server order.

Selecting an event opens its immutable before/after values, actor, timestamp, and reason. Undo calls the inventory event-revert mutation. The shared undo feedback reports success or a conflict and leaves the original event in the history.

If the page is offline or a history refresh fails, cached events remain visible and Undo stays disabled until the connection and latest history return.
