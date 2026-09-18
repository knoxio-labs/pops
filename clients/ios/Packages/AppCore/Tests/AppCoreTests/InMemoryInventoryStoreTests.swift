import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("In-memory inventory store")
internal struct InMemoryInventoryStoreTests {
    @Test("a created item is visible to a query already observing its location")
    func createIsObservable() async throws {
        let store = InMemoryInventoryStore(
            locations: [
                InventoryLocation(
                    id: "loc-1", revision: 1, seq: 1, name: "Garage", parentId: nil, sortOrder: 0)
            ])
        var values = store.observe(.contents(ofLocation: "loc-1")).makeAsyncIterator()
        _ = await values.next()

        _ = try await store.perform(
            .createItem(
                InventoryNewItem(
                    id: "item-1", name: "Drill", typeKey: nil, placement: .location("loc-1"))))

        let updated = try #require(await values.next())
        #expect(updated.map(\.id) == ["item-1"])
    }

    @Test("undoing a create removes the item again")
    func undoRemovesCreate() async throws {
        let store = InMemoryInventoryStore()
        let receipt = try await store.perform(
            .createItem(
                InventoryNewItem(id: "item-1", name: "Drill", typeKey: nil, placement: .hand)))

        try await store.undo(receipt)

        var iterator = store.observe(.item(id: "item-1")).makeAsyncIterator()
        let value = try #require(await iterator.next())
        #expect(value == nil)
    }

    @Test("undoing an edit restores the previous name")
    func undoRestoresPreviousEdit() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryItem(
                    id: "item-1", revision: 1, seq: 1, name: "Drill", typeKey: nil,
                    placement: .hand, createdAt: .now, updatedAt: .now)
            ])
        let receipt = try await store.perform(
            .editItem(id: "item-1", name: "Cordless drill", note: .unchanged, fields: [:]))

        try await store.undo(receipt)

        var iterator = store.observe(.item(id: "item-1")).makeAsyncIterator()
        let value = try #require(await iterator.next())
        #expect(value?.name == "Drill")
        #expect(value?.revision == 1)
    }

    @Test("a code already on another item is a collision, not a silent overwrite")
    func codeCollisionIsRejected() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryItem(
                    id: "item-1", revision: 1, seq: 1, name: "Drill", typeKey: nil, code: "B412",
                    placement: .hand, createdAt: .now, updatedAt: .now),
                InventoryItem(
                    id: "item-2", revision: 1, seq: 2, name: "Kettle", typeKey: nil,
                    placement: .hand, createdAt: .now, updatedAt: .now),
            ])

        await #expect(throws: RepositoryError.contractMismatch) {
            try await store.perform(.setItemCode(id: "item-2", code: "b412"))
        }
    }

    @Test("a quantity below one is rejected, matching the server's invariant")
    func quantityBelowOneIsRejected() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryItem(
                    id: "item-1", revision: 1, seq: 1, name: "Screws", typeKey: nil,
                    placement: .hand, createdAt: .now, updatedAt: .now)
            ])

        await #expect(throws: RepositoryError.contractMismatch) {
            try await store.perform(.setItemQuantity(id: "item-1", quantity: 0))
        }
    }

    @Test("resolving a repair moves it from open to resolved")
    func resolvingMovesRepairToResolved() async throws {
        let store = InMemoryInventoryStore()
        store.addRepair(
            InventoryRepair(
                id: "repair-1", entityKind: .item, entityId: "item-1", kind: .conflict,
                field: "name", openedAt: .now))

        try await store.resolve("repair-1", with: .discardMine)

        var iterator = store.observe(.syncLedger).makeAsyncIterator()
        let ledger = try #require(await iterator.next())
        #expect(ledger.repairs.isEmpty)
        #expect(ledger.resolved.map(\.id) == ["repair-1"])
    }

    @Test("resolving a repair that does not exist is a contract mismatch")
    func resolvingUnknownRepairFails() async {
        let store = InMemoryInventoryStore()

        await #expect(throws: RepositoryError.contractMismatch) {
            try await store.resolve("missing", with: .discardMine)
        }
    }

    @Test("deleting a location reparents its direct items to hand, remembering the deleted place")
    func deletingRootLocationSendsItemsToHand() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryItem(
                    id: "item-1", revision: 1, seq: 2, name: "Drill", typeKey: nil,
                    placement: .location("loc-1"), createdAt: .now, updatedAt: .now)
            ],
            locations: [
                InventoryLocation(
                    id: "loc-1", revision: 1, seq: 1, name: "Garage", parentId: nil, sortOrder: 0)
            ])

        _ = try await store.perform(.deleteLocation(id: "loc-1"))

        var iterator = store.observe(.item(id: "item-1")).makeAsyncIterator()
        let item = try #require(await iterator.next())
        #expect(item?.placement == .hand)
        #expect(item?.previousPlacement == .location("loc-1"))
    }

    @Test("splitting an item assigns the original and the new item distinct, increasing seqs")
    func splitItemAssignsDistinctIncreasingSeqs() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryItem(
                    id: "item-1", revision: 1, seq: 1, name: "Screws", typeKey: nil,
                    quantity: InventoryQuantity(count: 10), placement: .hand, createdAt: .now,
                    updatedAt: .now)
            ])

        _ = try await store.perform(
            .splitItem(id: "item-1", newItemId: "item-2", quantity: 4))

        var originalIterator = store.observe(.item(id: "item-1")).makeAsyncIterator()
        let original = try #require(await originalIterator.next())
        var newIterator = store.observe(.item(id: "item-2")).makeAsyncIterator()
        let new = try #require(await newIterator.next())

        let originalSeq = try #require(original?.seq)
        let newSeq = try #require(new?.seq)
        #expect(originalSeq != newSeq)
        #expect(newSeq > originalSeq)
    }

    @Test(
        "undoing a location delete restores the deleted location and every reparented child location and item"
    )
    func undoDeleteLocationRestoresReparentedChildren() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryItem(
                    id: "item-1", revision: 1, seq: 3, name: "Drill", typeKey: nil,
                    placement: .location("loc-parent"), createdAt: .now, updatedAt: .now)
            ],
            locations: [
                InventoryLocation(
                    id: "loc-grandparent", revision: 1, seq: 1, name: "House", parentId: nil,
                    sortOrder: 0),
                InventoryLocation(
                    id: "loc-parent", revision: 1, seq: 2, name: "Garage",
                    parentId: "loc-grandparent", sortOrder: 0),
                InventoryLocation(
                    id: "loc-child", revision: 1, seq: 3, name: "Shelf", parentId: "loc-parent",
                    sortOrder: 0),
            ])

        let receipt = try await store.perform(.deleteLocation(id: "loc-parent"))
        try await store.undo(receipt)

        var locationIterator = store.observe(.location(id: "loc-parent")).makeAsyncIterator()
        let location = try #require(await locationIterator.next())
        #expect(location?.deletedAt == nil)

        var childIterator = store.observe(.location(id: "loc-child")).makeAsyncIterator()
        let child = try #require(await childIterator.next())
        #expect(child?.parentId == "loc-parent")

        var itemIterator = store.observe(.item(id: "item-1")).makeAsyncIterator()
        let item = try #require(await itemIterator.next())
        #expect(item?.placement == .location("loc-parent"))
    }
}
