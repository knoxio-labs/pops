@testable import DesignPlayground
import Testing

@Suite("Inventory grounded dashboard interactions")
struct InventoryGroundedDashboardStateTests {
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
}
