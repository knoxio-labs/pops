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

    @Test("the In hand rows are the In hand page's records, photos and all")
    @MainActor
    func inHandRowsMatchThePage() {
        let state = InventoryGroundedDashboardState(fixture: InventoryFixtures.packing)

        #expect(state.inHand.items.map(\.item.name) == ["Passport", "Wi-Fi router"])
        #expect(state.inHand.items.allSatisfy { $0.photo != nil })
        #expect(state.inHand.items.map(\.fromLine) == ["From Documents drawer", "From Office 04"])
    }

    @Test("putting back and moving remove only their rows, and Undo returns them in place")
    @MainActor
    func resolveInHandItems() throws {
        var state = InventoryGroundedDashboardState(fixture: InventoryFixtures.packing)
        let passport = try #require(state.inHand.items.first)
        let router = try #require(state.inHand.items.last)

        let putBackOffer = state.inHand.putBack([passport.id])
        let putBack = try #require(putBackOffer)
        #expect(putBack.message == "Put back in Documents drawer")
        #expect(state.inHand.items.map(\.id) == [router.id])

        let movedOffer = state.inHand.move(
            [router.id], to: InventoryDestination(id: "hall", name: "Hall", kind: .location))
        let moved = try #require(movedOffer)
        #expect(moved.message == "Moved to Hall")
        #expect(state.inHand.isEmpty)

        state.inHand.undo(moved)
        #expect(state.inHand.items.map(\.id) == [router.id])
        state.inHand.undo(putBack)
        #expect(state.inHand.items.map(\.id) == [passport.id, router.id])
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
