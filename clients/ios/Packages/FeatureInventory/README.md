# FeatureInventory

Inventory on the phone. `InventoryFlowView` is the whole public surface: it owns the Inventory tab's `NavigationStack`, puts the dashboard at its root, and resolves every `InventoryRoute` itself. The app does not show it yet; the tab is wired in POPS-4066.

The package depends on `AppCore` and `DesignSystem` only, and reads and writes through `AppCore`'s `InventoryStore`. `ModuleBoundaryTests` in `AppCore` holds that line.

## One query per screen

The dashboard observes a single `InventoryQuery` built from several of the store's reads (`InventoryDashboardReader.swift`), not one stream per section. Every section therefore comes from the same state: putting something back removes it from In hand and adds it to its container's count in the same frame, and a write never has to patch the screen by hand. The view model's only state of its own is which receipt an Undo capsule reverses and the last write that failed.

Until that query answers once, the dashboard shows a skeleton. A store that ends the stream without ever answering (an unbound one does) shows an error with Retry instead, so a missing binding is never an endless skeleton.

## The views are the approved design, moved

The dashboard, its panels, tiles, rows and sync pill are the design playground's grounded dashboard (POPS-3978), moved here and fed from `InventoryDashboard` instead of fixtures. The `InventoryGrounded*` names are kept so the screens still to move can be carried over with their references intact.

Most of what the dashboard links to has not moved yet, and resolves to a pending screen until it does: item detail (POPS-4062), containers, locations and the destination picker behind Move (POPS-4064), the items browser, In hand and selection mode (POPS-4065), Sync and repair (POPS-4074), and the scanner (POPS-4078).

## The item form

New item and Edit item are one sheet (`Form/`), installed once over the whole stack by `InventoryFlowView`. A screen opens it through the `inventoryItemForm` environment value with an `InventoryItemFormRequest`; nothing pushes it as a route. Its fields are drawn from the catalogue descriptor the store serves, so a type the server adds renders without an app release.

Two things it reaches for belong to other screens, and it asks for them rather than owning them:

- **Where it goes.** The destination row opens whatever `inventoryPlacementPicker` the containers and locations screens install (POPS-4064). With none installed, the row states the placement it was opened with and does not offer to change it.
- **A suggested code.** Suggestions are the server's alone (`POST /codes/suggest`), and `InventoryStore` carries no call for them, so the form takes an `InventoryCodeSuggester`. Until the app binds one it answers as a server that cannot suggest, which the form shows as the approved unavailable state. A typed code is always checked against the replica, online or not.
