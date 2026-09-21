/// The one search tab, staged in the shell that carries every migrated
/// pillar, in every state it can be looked at in.
@MainActor
internal enum UniversalSearchSurfaces {
    internal static let rootID = SurfaceID(area: "search", slug: "root")

    internal static let root = DesignSurface(
        id: rootID,
        title: "Search",
        synopsis:
            "One search tab: a scope chip per migrated pillar, each answering in its own section.",
        chrome: .bare,
        states: [
            state("recents", "Recents", UniversalSearchStage()),
            state("first-launch", "First launch", .firstLaunch),
            state("all", "All, mixed", UniversalSearchStage(query: "tool")),
            state(
                "inventory", "Inventory only",
                UniversalSearchStage(query: "gar", scope: .pillar(.inventory))),
            state(
                "purchases", "Purchases only",
                UniversalSearchStage(query: "tool", scope: .pillar(.purchases))),
            state(
                "merchant-printed", "Matched on the till's wording",
                UniversalSearchStage(query: "alexandria", scope: .pillar(.purchases))),
            state("no-results", "No results", UniversalSearchStage(query: "xylophone")),
            state("loading", "First query in flight", loading),
            state("refining", "Refining", refining),
            state("failed", "Purchases failed", failed),
            state(
                "offline", "Offline, Inventory answers",
                .offline(query: "screw", staleIDs: InventorySearchFixtures.offlineStale)),
            state(
                "offline-purchases", "Offline, Purchases only",
                .offline(query: "tool", scope: .pillar(.purchases))),
            state(
                "code", "Matched by code",
                UniversalSearchStage(query: "b4", scope: .pillar(.inventory))),
            state(
                "filtered", "Filtered",
                UniversalSearchStage(
                    query: "gar", scope: .pillar(.inventory),
                    inventoryFilter: InventorySearchFilter(placement: .contained))),
            state(
                "filter-sheet", "Filter sheet",
                UniversalSearchStage(
                    query: "tool", inventoryFilter: InventorySearchFilter(placement: .contained),
                    showsFilters: true)),
            state(
                "inactive", "Including inactive",
                UniversalSearchStage(
                    query: "o", scope: .pillar(.inventory),
                    inventoryFilter: InventorySearchFilter(includesInactive: true))),
            state(
                "opened-purchase", "A purchase opened from a result",
                UniversalSearchStage(query: "screw", opened: .purchase("pur-bunnings"))),
        ]
    )

    internal static let surfaces: [DesignSurface] = [root]

    private static var loading: UniversalSearchStage {
        UniversalSearchStage(
            query: "screw",
            answers: [.inventory: .pending(previous: nil), .purchases: .pending(previous: nil)])
    }

    /// `sc` answered, `screw` asked: Inventory has answered the new query
    /// from the phone, Purchases still shows what it found for `sc`.
    private static var refining: UniversalSearchStage {
        UniversalSearchStage(query: "screw", answers: [.purchases: .pending(previous: "sc")])
    }

    private static var failed: UniversalSearchStage {
        UniversalSearchStage(query: "screw", answers: [.purchases: .failed])
    }

    private static func state(
        _ id: String, _ title: String, _ stage: UniversalSearchStage
    ) -> DesignState {
        DesignState(id, title) {
            InventoryShellView(fixture: InventoryFixtures.packing, search: stage)
        }
    }
}
