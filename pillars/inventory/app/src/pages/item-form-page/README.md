# Item create / edit form

One component (`../ItemFormPage.tsx`) serves both `/inventory/items/new` and
`/inventory/items/:id/edit`. Every mode difference keys off whether the route
carries an `:id`.

`useItemFormPageModel` spread-merges the returns of `usePhotoUploadState`,
`useDocumentUploadState`, `useAssetIdValidation` and `useItemMutations` with the
local UI state into one flat `model`, which `sections/section-adapters.tsx` fans
back out to the sections. The merged namespace is flat, so two of those hooks
returning the same key would collide silently by spread order.

It is not only a composition root — it owns data and effects of its own:
`useLocationsAndCreate` (the `locationsTree` query plus a `locationsCreate`
mutation), `useConnectionSearch` (an `itemsList` query enabled only in create
mode once `connectionSearch` reaches two characters), the edit-mode `itemsGet`
query, `useLocationIdPrefill` (pre-selects `?locationId=` in create mode, but
only if that id exists in the fetched tree) and `useUnsavedChangesGuard` (a
`beforeunload` handler installed while the form is dirty).

## Save ordering

Create runs three steps, in this order, in `useItemMutations.ts`:

1. `POST /items`.
2. Each connection queued in create mode is attached with `POST /connections`,
   sequentially, against the id the create returned.
3. Navigate to the new item's detail page.

Edit is a single `PATCH /items/:id` and then the same navigation. In both cases
navigation is deliberately issued before cache invalidation — the reason is on
the line itself.

## Asset IDs

Prefix derivation lives in `types.ts` (`extractPrefix`), generation and the
uniqueness lookup in `useAssetIdValidation.ts`. The on-blur uniqueness check is
advisory — it renders inline text and nothing more. Submit is never blocked by
it; the unique index on `home_inventory.asset_id` is the only real gate, and a
collision surfaces as a failed create/update toast.

## The two upload sections behave differently

Documents upload to inventory's own byte store (`documentFiles.*`), which is
unrelated to the Paperless document links managed from the item detail page. For
the create-mode behaviour, see the docblock on `useDocumentUploadState` in
`useDocumentUpload.ts`.

Photos differ in their create-mode terminal state: the dropzone renders and
files are compressed client-side, but `uploadOnePhoto` in
`photo-upload-helpers.ts` only calls the upload mutation once an item id exists
— otherwise it marks the entry `done` and drops it, where a document in the same
position is left `pending`. The page navigates away immediately after create.

## Talks to

Only the inventory pillar, through the generated client mounted at
`/inventory-api`. No cross-pillar calls.
