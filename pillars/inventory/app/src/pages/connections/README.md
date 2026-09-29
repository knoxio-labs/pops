# Connections page

`/inventory/connections` is the inventory connection registry. Its page
description is "What plugs into, feeds or pairs with what, across the house."
The list is server-ordered and server-filtered; the browser does not sort,
filter, or recount rows. The search field keeps its exact text in the URL and
sends the trimmed query after 200 ms of inactivity. The kind tabs update the
URL immediately and send the selected kind after 150 ms.

Rows resolve item endpoints through the placement world and preserve the raw
registry row for mutations. A missing item endpoint is omitted until placement
data resolves. The graph and trace read the complete unfiltered registry;
fixtures are graph leaves and terminate traces. Item and fixture keys are
prefixed so identical IDs cannot collide, and either kind of graph node opens
its inventory page.

The page keeps the last successful placement world while a refreshed placement
read is pending. A failed read replaces the page body with a retry state. The
offline state takes precedence over stale data and disables Connect and
Disconnect actions. Disconnecting multiple rows sends requests in display
order and offers one undo action for the complete batch.
