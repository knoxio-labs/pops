# FeatureInventory

Inventory on the phone. `InventoryFlowView` is the whole public surface: it owns the Inventory tab's `NavigationStack`, puts the dashboard at its root, and resolves every `InventoryRoute` itself. The app does not show it yet; the tab is wired in POPS-4066.

The package depends on `AppCore` and `DesignSystem` only, and reads and writes through `AppCore`'s `InventoryStore`. `ModuleBoundaryTests` in `AppCore` holds that line.

## One query per screen

The dashboard observes a single `InventoryQuery` built from several of the store's reads (`InventoryDashboardReader.swift`), not one stream per section. Every section therefore comes from the same state: putting something back removes it from In hand and adds it to its container's count in the same frame, and a write never has to patch the screen by hand. The view model's only state of its own is which receipt an Undo capsule reverses and the last write that failed.

Until that query answers once, the dashboard shows a skeleton. A store that ends the stream without ever answering (an unbound one does) shows an error with Retry instead, so a missing binding is never an endless skeleton.

## The views are the approved design, moved

The dashboard, its panels, tiles, rows and sync pill are the design playground's grounded dashboard (POPS-3978), moved here and fed from `InventoryDashboard` instead of fixtures. The `InventoryGrounded*` names are kept so the screens still to move can be carried over with their references intact.

Most of what the dashboard links to has not moved yet, and resolves to a pending screen until it does: the items browser, In hand and selection mode (POPS-4065), Sync and repair (POPS-4074), and the scanner (POPS-4078). Item detail (POPS-4062), containers and locations (POPS-4064) have moved.

## One placement picker

`Containers`, `Locations`, `Detail` and the dashboard never build their own destination chooser. Every Move, Put back, Store here and new-place-inline flow goes through `InventoryDestinationPickerSheet` (`Picker/InventoryDestinationPicker.swift`), which only chooses, and one of two callers that turn a choice into commands:

- `inventoryPlacementPicker(_:runner:onPlaced:)` (`Picker/InventoryPlacementPicker.swift`) is what a screen attaches for Move and Put back. It binds an `InventoryPlacementRequest` (an id or a set of item ids, plus the verb and titles to show), reads `InventoryPlacementChoices` from the replica — the put-back destination, recent places, open containers, and the location tree with any container the subject cannot move into filtered out — and on commit turns the choice into an `InventoryPlacementPlan`: a new place is created first when one was named inline, then the move (or, for a place, `location.move`) is issued through the runner, which offers Undo the same way the calling screen's own writes do.
- `InventoryStoreHereSheet` (`Picker/InventoryStoreHereSheet.swift`) is Store here's own sheet: a new item or an existing one, chosen from `InventoryStoreCandidate.candidates(reading:for:query:)`, stored with the `store` verb.

`InventoryLocationTree` (`Picker/InventoryLocationTree.swift`, read in `InventoryLocationTree+Reading.swift`) is the one flattened read of the place hierarchy every one of these draws from — the browser, a place's own page, and the picker's location level all read the same tree rather than each walking `InventoryLocation` rows themselves. A location has no kind of its own (ADR-002): the browser, the row label and the create sheet draw one place glyph and ask only for a name and a parent, where the design's playground fixtures carried a room-shelf-drawer kind that nothing in the replica records.

