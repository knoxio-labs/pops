import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory dashboard actions")
internal struct InventoryDashboardActionTests {
    private typealias Fixture = InventoryFixture

    private static func store() -> InMemoryInventoryStore {
        InMemoryInventoryStore(
            items: [
                Fixture.item("box", "Kitchen 12", at: .location("kitchen"), access: .open),
                Fixture.item("router", "Wi-Fi router", at: .hand, previous: .location("office")),
                Fixture.item("rake", "Rake", at: .hand, previous: .tombstoned),
            ],
            locations: [
                Fixture.location("kitchen", "Kitchen"), Fixture.location("office", "Office 04"),
            ],
            events: [Fixture.event(9, .moved, on: "router")])
    }

    @Test("Put back moves the item to where it came from and offers Undo, which returns it")
    func putBackThenUndo() async throws {
        let model = InventoryDashboardViewModel(store: Self.store())
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        let router = try #require(loaded?.inHand.first { $0.id == "router" })

        await model.putBack(router)
        let afterPutBack = await model.awaitDashboard { !$0.inHand.contains { $0.id == "router" } }
        let offer = try #require(model.undoOffer)
        #expect(afterPutBack != nil)
        #expect(offer.message == "Put back in Office 04")

        await model.undo(offer)
        let afterUndo = await model.awaitDashboard { $0.inHand.contains { $0.id == "router" } }
        #expect(afterUndo != nil)
        #expect(model.failure == nil)
    }

    @Test("Put back does nothing for a row whose previous place is gone")
    func putBackWithNowhereToGoIsInert() async throws {
        let model = InventoryDashboardViewModel(store: Self.store())
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        let rake = try #require(loaded?.inHand.first { $0.id == "rake" })

        await model.putBack(rake)

        #expect(model.undoOffer == nil)
        #expect(model.failure == nil)
        #expect(model.dashboard?.inHand.map(\.id).contains("rake") == true)
    }

    @Test("an Undo offer is spent once: a second tap reverses nothing more")
    func undoOfferIsSpentOnce() async throws {
        let model = InventoryDashboardViewModel(store: Self.store())
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        await model.putBack(try #require(loaded?.inHand.first { $0.id == "router" }))
        let offer = try #require(model.undoOffer)

        await model.undo(offer)
        await model.undo(offer)

        #expect(model.failure == nil)
    }

    @Test("closing a container takes it out of the open containers panel")
    func closeRemovesFromOpenContainers() async throws {
        let model = InventoryDashboardViewModel(store: Self.store())
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        let box = try #require(loaded?.openContainers.first)

        await model.close(box)

        #expect(await model.awaitDashboard { $0.openContainers.isEmpty } != nil)
    }

    @Test("a write the store refuses is reported, not swallowed")
    func refusedWriteIsReported() async throws {
        let model = InventoryDashboardViewModel(store: Self.store())
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        let activity = try #require(loaded?.recentWork.first)

        await model.undo(activity)

        #expect(model.failure == .contractMismatch)
    }

    @Test("Undo on an event that is no longer undoable sends nothing")
    func nonUndoableActivityIsInert() async {
        let model = InventoryDashboardViewModel(store: Self.store())
        let activity = InventoryDashboard.Activity(
            id: 9, title: "Wi-Fi router moved", place: nil, at: Fixture.epoch,
            symbol: "arrow.right",
            isUndoable: false)

        await model.undo(activity)

        #expect(model.failure == nil)
    }

    @Test("a failed write against a store that is down reads as unavailable")
    func pendingStoreWriteFails() async {
        let model = InventoryDashboardViewModel(store: PendingInventoryStore())
        let container = InventoryDashboard.OpenContainer(
            id: "box", name: "Box", place: nil, itemCount: 0, updatedAt: Fixture.epoch)

        await model.close(container)

        #expect(model.failure == .unavailable)
    }
}
