import Testing

@testable import DesignPlayground

@Suite("Inventory grounded dashboard interactions")
internal struct InventoryGroundedDashboardStateTests {
    @Test("closing a container removes only that open container")
    @MainActor
    func closeContainer() {
        var state = InventoryGroundedDashboardState(fixture: InventoryFixtures.packing)
        let target = InventoryFixtures.containers[1]

        state.close(target)

        #expect(state.containers.map(\.id) == ["kitchen-12", "garage-tools"])
    }

    @Test("putting back and moving items remove only their selected rows")
    @MainActor
    func resolveInHandItems() {
        var state = InventoryGroundedDashboardState(fixture: InventoryFixtures.packing)

        state.putBack(InventoryFixtures.items[0])
        #expect(state.inHandItems.map(\.id) == ["router"])

        state.move(InventoryFixtures.items[1])
        #expect(state.inHandItems.isEmpty)
    }

    @Test("undo removes only the selected work entry")
    @MainActor
    func undoRecentWork() {
        var state = InventoryGroundedDashboardState(fixture: InventoryFixtures.packing)

        state.undo(InventoryFixtures.activity[1])

        #expect(state.activities.map(\.id) == ["moved-router", "added-drill"])
    }

    @Test("catalogue totals remain independent from the open container state")
    @MainActor
    func catalogueTotals() {
        let noOpenContainers = InventoryFixtures.packing(openContainers: 0)
        let firstRun = InventoryFixtures.firstRun

        #expect(noOpenContainers.catalogue == InventoryFixtures.packing.catalogue)
        #expect(noOpenContainers.containers.isEmpty)
        #expect(
            firstRun.catalogue == InventoryCatalogueCounts(items: 0, containers: 0, locations: 0))
    }
}
