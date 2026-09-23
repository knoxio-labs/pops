# FeatureInventory

Place detail keeps its icon and name in the inline navigation bar alongside the system back button. The navigation bar belongs to the page across loading, missing, and loaded states; breadcrumbs and counts remain in the scrolling content.

Inventory on the phone. `InventoryFlowView` is the Inventory tab: it owns the tab's `NavigationStack`, puts the dashboard at its root, and resolves every `InventoryRoute` itself. `InventoryEntity` and `InventoryEntityView` are the other public surface: the app registers `InventoryEntity.types` under `InventoryEntity.pillar` with its `EntityRouter`, and presents the referenced item, container or place on a stack of its own when a label or a `pops://inventory/...` link names one.

The package depends on `AppCore` and `DesignSystem` only, and reads and writes through `AppCore`'s `InventoryStore`. `ModuleBoundaryTests` in `AppCore` holds that line.

## Shared visual primitives

List panels, divided rows, section labels, quiet lines, notices, skeletons, page titles, motion, search controls, glass groups, prominent glass actions, dashed actions and grounded swipe behavior come from `DesignSystem`. Inventory supplies `.popsInventory` to the shared controls that take a feature tint. It keeps its selection decoration between `popsPanelInsets()` and `popsPanelGround()`; `InventorySelectionPanel` combines that decoration with `PopsDividedRows`. Promoting these primitives preserves each modifier's order and appearance.

## One query per screen

The dashboard observes a single `InventoryQuery` built from several of the store's reads (`InventoryDashboardReader.swift`), not one stream per section. Every section therefore comes from the same state: putting something back removes it from In hand and adds it to its container's count in the same frame, and a write never has to patch the screen by hand. The view model's only state of its own is which receipt an Undo capsule reverses and the last write that failed.

Until that query answers once, the dashboard shows a skeleton. A store that ends the stream without ever answering (an unbound one does) shows an error with Retry instead, so a missing binding is never an endless skeleton.

## The views are the approved design, moved

The dashboard, its panels, tiles, rows and sync pill are the design playground's grounded dashboard (POPS-3978), moved here and fed from `InventoryDashboard` instead of fixtures. The `InventoryGrounded*` names are kept so the screens still to move can be carried over with their references intact.

Everything the dashboard links to has its own screen: item detail (POPS-4062), containers and locations (POPS-4064), the item form (POPS-4063), the items browser, In hand and selection mode (POPS-4065), Sync and repair (POPS-4074), the scanner (POPS-4078), and the full-screen open containers list (POPS-4113). The playground has no design for Recent activity; it is the item History page over every record's newest events (POPS-4198), and a Recent work row opens the record its event is about.

## One placement picker

`Containers`, `Locations`, `Detail` and the dashboard never build their own destination chooser. Every Move, Put back, Store here and new-place-inline flow goes through `InventoryDestinationPickerSheet` (`Picker/InventoryDestinationPicker.swift`), which only chooses, and one of two callers that turn a choice into commands:

- `inventoryPlacementPicker(_:runner:onPlaced:)` (`Picker/InventoryPlacementPicker.swift`) is what a screen attaches for Move and Put back. It binds an `InventoryPlacementRequest` (an id or a set of item ids, plus the verb and titles to show), reads `InventoryPlacementChoices` from the replica — the put-back destination, recent places, open containers, and the location tree with any container the subject cannot move into filtered out — and on commit turns the choice into an `InventoryPlacementPlan`: a new place is created first when one was named inline, then the move (or, for a place, `location.move`) is issued through the runner, which offers Undo the same way the calling screen's own writes do.
- `InventoryStoreHereSheet` (`Picker/InventoryStoreHereSheet.swift`) is Store here's own sheet: a new item or an existing one, chosen from `InventoryStoreCandidate.candidates(reading:for:query:)`, stored with the `store` verb.

`InventoryLocationTree` (`Picker/InventoryLocationTree.swift`, read in `InventoryLocationTree+Reading.swift`) is the one flattened read of the place hierarchy every one of these draws from — the browser, a place's own page, and the picker's location level all read the same tree rather than each walking `InventoryLocation` rows themselves. A location has no kind of its own (ADR-002): the browser, the row label and the create sheet draw one place glyph and ask only for a name and a parent, where the design's playground fixtures carried a room-shelf-drawer kind that nothing in the replica records.

## The item form

New item and Edit item are one sheet (`Form/`), installed once over the whole stack by `InventoryFlowView`. A screen opens it through the `inventoryItemForm` environment value with an `InventoryItemFormRequest`; nothing pushes it as a route. Protocol 2 fields are drawn from the cached catalogue by stable type, field and option IDs, so a type the server adds renders without an app release. Stored primitive fields support one or ordered-many values; reference choices come from the replica and obey the catalogue's kind and item-type constraints. The same cached catalogue validates online and offline writes. Retired options remain readable but cannot be newly selected, computed values stay read-only, and catalogue rejections in Sync identify the queued item that must be edited or discarded. A protocol 1 catalogue keeps the existing keyed form path.

Two things it reaches for belong to other screens, and it asks for them rather than owning them:

- **Where it goes.** The destination row opens the same `inventoryPlacementPicker` the containers and locations screens install (POPS-4064).
- **A suggested code.** Suggestions are the server's alone (`POST /codes/suggest`), and `InventoryStore` carries no call for them, so the form takes an `InventoryCodeSuggester`. Until the app binds one it answers as a server that cannot suggest, which the form shows as the approved unavailable state. A typed code is always checked against the replica, online or not.

## Search, the items browser and In hand

`Search/`, `Browse/` and `InHand/` are the three ways to end up looking at one item outside its own page, each over one query built the same way the dashboard's is:

- `InventorySearchViewModel` ranks the replica's own search in tiers — name prefix, name contains, then everything else, records before places — through `InventorySearchRanking.swift`, narrowed by the missing-type and include-inactive filters (`InventorySearchFilter.swift`) and remembering recent queries (`InventorySearchRecents.swift`) in `AppStorage`, not the replica.
- `InventorySearchProvider` exposes that same ranking to universal search without adding a network dependency. It answers immediately and continues observing replica writes; an empty first-launch replica reports that Inventory is not on the phone until download completes.
- `InventorySearchRows` and `InventorySearchSession` preserve Inventory's row navigation, selection and write behavior when those results appear in another feature's search screen. `inventorySearchChrome` installs the placement picker, feedback, item form and replica interruptions once around that host, while `inventorySearchDestinations` keeps Inventory's routes private behind a public registration seam.
- `InventoryItemsBrowserViewModel` reads every non-container item in one query (`inventoryItems(includeInactive:)`), sectioned by initial when sorted by name and otherwise left in the replica's own order, with the same missing-type and include-inactive filters Search uses.
- `InventoryInHandViewModel` reads the dashboard's own In-hand rows as a page of their own, with Put back and Put all back (`InHand/InventoryInHand.swift`): Put back does nothing for a row whose previous place was deleted, and Put all back only appears once there is more than one thing in hand.

Move, from any of the three, and from the dashboard's own In hand section, goes through the same `inventoryPlacementPicker` and `InventoryCommandRunner` Containers and Locations use (POPS-4064): each view model carries its own runner, built from the same store as its `InventoryWriter`.

## A type arrives

`Untyped/` is the type-arrived sheet (POPS-4106), attached to the dashboard with `inventoryTypeArrivedSheet(_:)`. `InventoryTypeArrivalModel` follows `InventoryQuery.typeArrival`, records the ask with `settleTypeArrival(typeKey:)` before opening the sheet, so it shows once however it is closed, and Apply types the ticked items with one `item.changeType` each through the dashboard's `InventoryCommandRunner`, whose capsule offers Undo.

## Deduplication

Search, Browse and In hand share Inventory-specific rows, selection panels and symbols through `Components/`. Their search, motion, glass and empty-state controls come from `DesignSystem`, so another feature can use the same behavior with its own tint instead of importing Inventory.
