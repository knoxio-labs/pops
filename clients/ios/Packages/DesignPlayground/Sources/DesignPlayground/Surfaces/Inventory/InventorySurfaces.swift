internal enum InventorySurfaces {
    @MainActor internal static let root = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "root"),
        title: "Inventory",
        synopsis: "Find, move, and resume work without losing the Inventory tab stack.",
        chrome: .navigationAndTabs,
        states: [
            DesignState.standard {
                InventoryGroundedDashboardView(fixture: InventoryFixtures.packing)
            },
            DesignState("first-run", "First synchronization") {
                InventoryGroundedDashboardView(fixture: InventoryFixtures.firstRun)
            },
            DesignState("active-packing", "Active packing") {
                InventoryGroundedDashboardView(fixture: InventoryFixtures.packing)
            },
            DesignState("settled-home", "Settled home") {
                InventoryGroundedDashboardView(fixture: InventoryFixtures.settled)
            },
            DesignState("offline-stale", "Offline and stale") {
                InventoryGroundedDashboardView(
                    fixture: InventoryFixtures.withSync(.offline(updated: "2h ago")))
            },
            DesignState("synchronizing", "Synchronizing") {
                InventoryGroundedDashboardView(
                    fixture: InventoryFixtures.withSync(.synchronizing(progress: "62%")))
            },
            DesignState("needs-attention", "Needs attention") {
                InventoryGroundedDashboardView(
                    fixture: InventoryFixtures.withSync(.needsAttention(count: 3)))
            },
            DesignState("no-open-containers", "No open containers") {
                InventoryGroundedDashboardView(
                    fixture: InventoryFixtures.packing(openContainers: 0))
            },
            DesignState("one-open-container", "One open container") {
                InventoryGroundedDashboardView(
                    fixture: InventoryFixtures.packing(openContainers: 1))
            },
            DesignState("several-open-containers", "Several open containers") {
                InventoryGroundedDashboardView(
                    fixture: InventoryFixtures.packing(openContainers: 3))
            },
        ]
    )

    @MainActor internal static let surfaces: [DesignSurface] = [root]
}
