# Items list

`/inventory` (the route index). Table and grid render the same `items` array;
switching between them is local state and never refetches.

## The URL is the filter state

`useItemsPageFilters` reads and writes `q`, `type`, `condition`, `inUse` and
`locationId` on the query string — there is no local filter state to keep in
sync, so reload, deep link and browser back all work by construction. `q` is
debounced 300ms before it reaches `buildQueryInput`; the other four apply
immediately. "Clear filters" resets the four selects and leaves `q` alone.

Pressing Enter in the search box is a separate path: it calls
`GET /items/search/by-asset-id` and, on an exact hit, navigates straight to that
item's detail page. A miss or an error leaves the user on the list with the
substring search results already shown.

## The request is unpaginated; the table paginates what arrives

`buildQueryInput` requests a flat `limit: 200` with no offset, and nothing in
this page reads `pagination.hasMore`. The count chip in `SummaryAndView` shows
the server's `pagination.total`, so past 200 items the chip reports the real
total while only the first 200 are ever in hand. `InventoryTable` then pages
that array client-side (`paginated defaultPageSize={20}` on the shared
`DataTable`); the grid renders every row it was given. Column sorting is
client-side too, over the same truncated array.

## Location display

The location tree is fetched once here and turned into two derived shapes by
`useItemsPageLocations`: an indented flat option list for the filter select, and
a path map used to render per-row breadcrumbs.

View mode persists in `localStorage` under `inventory-view-mode`, defaulting to
table.
