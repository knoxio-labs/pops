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

## The full list is fetched in 200-row pages; the table paginates what arrives

`buildQueryInput` requests `limit: 200`. `fetchAllItemPages`
(`useItemsPageModel.ts`) walks `offset` forward one 200-row page at a time
until `pagination.hasMore` is false, so the query resolves with every row
regardless of library size (bounded at `MAX_ITEM_PAGES` as a guard against a
malformed `hasMore`). `useItemsPageModel` owns an `AbortController` per walk
and aborts the previous one as soon as a filter change starts a new one, so
changing a filter mid-walk cancels the stale fetch instead of letting it keep
paging in the background. `InventoryTable` then paginates that full array
client-side
(`paginated defaultPageSize={20}` on the shared `DataTable`); the grid renders
every row it was given. Column sorting is client-side too, now over the
complete array rather than a 200-row slice (server-driven sort/paging is
POPS-43, still open).

Offset pagination has no cursor: a row deleted between two page requests
shifts everything after it left by one, so the row that would have landed on
the next page's offset is skipped by both requests. `fetchAllItemPages`
detects this from a `pagination.total` that changed between pages of the same
walk and retries the whole walk (bounded at `MAX_CONSISTENCY_ATTEMPTS`) rather
than silently returning a list with a hole in it. This is a mitigation, not a
guarantee — closing the race for good needs keyset pagination, which is a
contract change out of scope here.

## Location display

The location tree is fetched once here and turned into two derived shapes by
`useItemsPageLocations`: an indented flat option list for the filter select, and
a path map used to render per-row breadcrumbs.

View mode persists in `localStorage` under `inventory-view-mode`, defaulting to
table.
