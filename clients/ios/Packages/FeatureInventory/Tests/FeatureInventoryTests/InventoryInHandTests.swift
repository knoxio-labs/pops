import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("In hand: Put back and Put all back")
internal struct InventoryInHandTests {
    private static func item(
        _ id: String, previous: InventoryPreviousPlace
    ) -> InventoryDashboard.InHandItem {
        InventoryDashboard.InHandItem(
            id: id, name: id, access: nil, quantity: InventoryQuantity(count: 1),
            sync: .synchronized,
            photo: nil, previous: previous)
    }

    @Test("Put all back is offered only above one row in hand")
    func offersPutAllBackAboveOneRow() {
        let one = [Self.item("a", previous: .nowhere)]
        let two = [Self.item("a", previous: .nowhere), Self.item("b", previous: .nowhere)]

        #expect(InventoryInHand.offersPutAllBack(one) == false)
        #expect(InventoryInHand.offersPutAllBack(two))
    }

    @Test("Put back has nothing to do for a row whose previous place was deleted")
    func putBackDisabledWhenPreviousPlaceIsTombstoned() {
        let tombstoned = Self.item("a", previous: .deleted)

        #expect(tombstoned.previous.putBackPlacement == nil)
        #expect(InventoryInHand.canPutAnyBack([tombstoned]) == false)
        #expect(InventoryInHand.putBack(["a"], from: [tombstoned]) == nil)
    }

    @Test("Put back moves only the rows that have somewhere to go, and counts them in one Undo")
    func putBackMovesOnlyRowsWithSomewhereToGo() throws {
        let stays = Self.item("stays", previous: .deleted)
        let goes = Self.item(
            "goes", previous: .place(name: "Kitchen", placement: .location("kitchen")))

        let plan = try #require(InventoryInHand.putBack(["stays", "goes"], from: [stays, goes]))

        #expect(plan.commands == [.moveItem(id: "goes", to: .location("kitchen"), verb: .putBack)])
        #expect(plan.offer.message == "Put back in Kitchen")
    }

    @Test("Put back through the store moves a live row and leaves a tombstoned one in hand")
    func putBackThroughStoreLeavesTombstonedRowInHand() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryFixture.item("a", "Widget", at: .hand, previous: .tombstoned),
                InventoryFixture.item("b", "Gadget", at: .hand, previous: .location("kitchen")),
            ],
            locations: [InventoryFixture.location("kitchen", "Kitchen")])
        var iterator = store.observe(InventoryInHandPage.query).makeAsyncIterator()
        let before = try #require(await iterator.next())
        let writer = InventoryWriter(store: store)

        await writer.putBack(Set(before.items.map(\.id)), from: before.items)

        var afterIterator = store.observe(InventoryInHandPage.query).makeAsyncIterator()
        let after = try #require(await afterIterator.next())
        #expect(after.items.map(\.id) == ["a"])
    }
}
