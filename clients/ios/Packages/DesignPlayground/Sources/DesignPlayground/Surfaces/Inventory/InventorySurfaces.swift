internal enum InventorySurfaces {
    @MainActor internal static let root = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "root"),
        title: "Inventory",
        synopsis: "Find, move, and resume work without losing the Inventory tab stack.",
        chrome: .bare,
        states: [
            DesignState.standard {
                InventoryShellView(fixture: InventoryFixtures.packing)
            },
            DesignState("first-run", "First synchronization") {
                InventoryShellView(fixture: InventoryFixtures.firstRun)
            },
            DesignState("active-packing", "Active packing") {
                InventoryShellView(fixture: InventoryFixtures.packing)
            },
            DesignState("settled-home", "Settled home") {
                InventoryShellView(fixture: InventoryFixtures.settled)
            },
            DesignState("offline-stale", "Offline and stale") {
                InventoryShellView(
                    fixture: InventoryFixtures.withSync(.offline(updated: "2h ago")))
            },
            DesignState("synchronizing", "Synchronizing") {
                InventoryShellView(
                    fixture: InventoryFixtures.withSync(.synchronizing(progress: "62%")))
            },
            DesignState("needs-attention", "Needs attention") {
                InventoryShellView(
                    fixture: InventoryFixtures.withSync(.needsAttention(count: 3)))
            },
            DesignState("no-open-containers", "No open containers") {
                InventoryShellView(
                    fixture: InventoryFixtures.packing(openContainers: 0))
            },
            DesignState("one-open-container", "One open container") {
                InventoryShellView(
                    fixture: InventoryFixtures.packing(openContainers: 1))
            },
            DesignState("several-open-containers", "Several open containers") {
                InventoryShellView(
                    fixture: InventoryFixtures.packing(openContainers: 3))
            },
        ]
    )

    @MainActor internal static let surfaces: [DesignSurface] = [root]
}
