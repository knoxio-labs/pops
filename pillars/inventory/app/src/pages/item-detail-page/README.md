# Item detail page

`/inventory/items/:id`. The page is assembled from many independent requests;
there is no aggregate endpoint behind it.

## Who fetches what

`useItemDetailPageModel` owns only four reads — the item, its location ancestor
path (skipped when `locationId` is null), the connection edge list, and the
photos — plus the delete / disconnect / photo-reorder mutations.

Everything else is fetched inside the section that renders it:

- `sections/DocumentsSection.tsx` — Paperless status and the linked-document
  list.
- `sections/ConnectionsSection.tsx` — the trace tree and the graph, each behind
  its own component (`components/ConnectionTracePanel`, `components/ConnectionGraph`).
- One `GET /items/:id` **per connection row**. The edge list returns id pairs
  only, so each row resolves the other side's name, brand and badges itself.

The delete confirmation's "will also remove N connection(s) and M photo(s)" is
built from what is already loaded: the connection count is the fetched array's
length, the photo count is that response's `pagination.total`. Nothing asks the
server what a delete would cascade.

## Documents section gating

Driven entirely by `GET /paperless/status`: not configured → the section renders
nothing at all; still loading → header plus skeleton; configured but unreachable
→ header plus "Paperless-ngx unavailable"; available → the full list with the
link dialog. Only Paperless links appear here — direct file uploads are an
item-form concern and are not shown on this page.

## Photo bytes

Photo files do not come through the generated client at `/inventory-api` — the
header of `src/api/files/router.ts` describes the raw byte routes, and
`pillars/shell/nginx.conf` proxies them.

## Derived client-side

The warranty badge is `WarrantyBadge` from `@pops/ui`, which derives state and
label from `warrantyExpires` against today. The server sends no warranty status
or days-remaining anywhere in this pillar.
