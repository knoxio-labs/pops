internal enum InventorySurfaces {
    @MainActor internal static let root = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "root"),
        title: "Inventory",
        synopsis: "Find, move, and resume work without losing the Inventory tab stack.",
        chrome: .navigationAndTabs,
        states: [
            DesignState.standard {
                InventoryDashboardView(fixture: InventoryFixtures.packing, layout: .packingFirst)
            },
            DesignState("first-run", "First synchronization") {
                InventoryDashboardView(fixture: InventoryFixtures.firstRun, layout: .packingFirst)
            },
            DesignState("active-packing", "Active packing") {
                InventoryDashboardView(fixture: InventoryFixtures.packing, layout: .packingFirst)
            },
            DesignState("settled-home", "Settled home") {
                InventoryDashboardView(fixture: InventoryFixtures.settled, layout: .packingFirst)
            },
            DesignState("offline-stale", "Offline and stale") {
                InventoryDashboardView(
                    fixture: InventoryFixtures.withSync(.offline(updated: "2h ago")),
                    layout: .packingFirst)
            },
            DesignState("synchronizing", "Synchronizing") {
                InventoryDashboardView(
                    fixture: InventoryFixtures.withSync(.synchronizing(progress: "62%")),
                    layout: .packingFirst)
            },
            DesignState("needs-attention", "Needs attention") {
                InventoryDashboardView(
                    fixture: InventoryFixtures.withSync(.needsAttention(count: 3)),
                    layout: .packingFirst)
            },
            DesignState("no-open-containers", "No open containers") {
                InventoryDashboardView(
                    fixture: InventoryFixtures.packing(openContainers: 0), layout: .packingFirst)
            },
            DesignState("one-open-container", "One open container") {
                InventoryDashboardView(
                    fixture: InventoryFixtures.packing(openContainers: 1), layout: .packingFirst)
            },
            DesignState("several-open-containers", "Several open containers") {
                InventoryDashboardView(
                    fixture: InventoryFixtures.packing(openContainers: 3), layout: .packingFirst)
            },
        ]
    )

    @MainActor internal static let surfaces: [DesignSurface] = [root]
}
