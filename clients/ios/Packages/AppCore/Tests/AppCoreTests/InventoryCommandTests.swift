import AppCore
import AppCoreFakes
import Testing

@Suite("Inventory command entity")
internal struct InventoryCommandTests {
    @Test("a revert is filed under the reverted event's entity, not an item by default")
    func revertNamesItsEventsEntity() {
        let command = InventoryCommand.revertEvent(
            seq: 7, entityKind: .location, entityId: "loc-1")

        #expect(command.entityId == "loc-1")
        #expect(command.entityKind == .location)
    }

    @Test("location commands are filed under locations and item commands under items")
    func kindFollowsTheCommand() {
        #expect(InventoryCommand.renameLocation(id: "loc-1", name: "Shed").entityKind == .location)
        #expect(InventoryCommand.deleteLocation(id: "loc-1").entityKind == .location)
        #expect(
            InventoryCommand.moveItem(id: "item-1", to: .hand, verb: .pickUp).entityKind == .item)
        #expect(InventoryCommand.restoreDeletedItem(id: "item-1").entityKind == .item)
        #expect(InventoryCommand.deleteItem(id: "item-1").entityKind == .item)
        #expect(InventoryCommand.deleteItem(id: "item-1").entityId == "item-1")
    }

    @Test("the in-memory store's receipt carries the command's own entity")
    func fakeReceiptFillsTheEntity() async throws {
        let store = InMemoryInventoryStore()

        let receipt = try await store.perform(
            .createLocation(
                InventoryNewLocation(id: "loc-1", name: "Shed", parentId: nil, sortOrder: 0)))

        #expect(receipt.entityKind == .location)
        #expect(receipt.entityId == "loc-1")
    }
}
