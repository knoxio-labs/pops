# Reports

Read-only. Every endpoint recomputes from the live tables on each request —
nothing here is cached, materialised or incrementally maintained.

## The 90-day warranty window only bounds one count

`WARRANTY_WINDOW_DAYS` in `service.ts` bounds one thing only: the
`warrantiesExpiringSoon` count on the dashboard. No endpoint in this pillar ever
returns a warranty tier or a days-remaining number — `listWarrantyItems` just
filters to rows with an expiry and sorts ascending, and the insurance report
passes `warrantyExpires` through raw. Any consumer showing warranty urgency is
deriving it itself.

## Warranty list rows are not unique per item

`listWarrantyItems` left-joins `item_documents` on
`document_type = 'warranty'` to attach `warrantyDocumentId`. The join is not
collapsed, so an item with two linked warranty documents comes back as two rows
with the same item id.

## The insurance report is computed in memory

`insurance-report.ts` selects every item, every location, every photo and every
receipt link, then filters, sorts and groups in JavaScript — there is no SQL
`WHERE` for the location scope and no recursive CTE. `includeChildren` resolves
the subtree by walking a `parentId` children map. Groups sort alphabetically by
location name with the no-location group forced last, and the primary photo is
the lowest `sortOrder` row per item.

Money rounding is inconsistent by construction: the dashboard rounds its two
totals to 2dp, the insurance report's `totalValue` is a raw float sum.
