# Inventory places

The Places web slice owns `/inventory/locations` and the selected-place preview. The detail route at `/inventory/locations/:id` is assembled from the adjacent `pages/location-page` modules and uses the same placement world and place foundations.

The tree and contents surfaces use the shared placement verdicts in `foundation/places`. Pointer dragging uses dnd-kit with a 4px activation distance; it has no native-drag or keyboard sensor path. Place rows accept before, inside, and after drops, while item rows, box headers, child places, and the temporary In hand strip share the item move plan. The Move picker remains the keyboard and non-pointer equivalent.

Place names are trimmed and checked case-insensitively against siblings. Place deletion loads the complete active/inactive scope before offering either reparenting or putting contents in hand; top-level reparenting is refused, and empty places are deleted without a second choice.

The pure placement and interaction tests live beside the implementation. Run the focused slice with:

```bash
pnpm --dir pillars/inventory/app exec vitest run --config vitest.config.ts src/pages/locations src/pages/location-page/LocationPage.test.tsx
```
