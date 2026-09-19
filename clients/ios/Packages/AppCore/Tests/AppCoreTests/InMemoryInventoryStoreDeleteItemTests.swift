import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("In-memory store item delete")
internal struct InMemoryInventoryStoreDeleteItemTests {
    private static func store() -> InMemoryInventoryStore {
        InMemoryInventoryStore(items: [
            InventoryItem(
                id: "crate", revision: 1, seq: 1, name: "Crate", typeKey: nil, placement: .hand,
                containment: InventoryContainment(access: .open, isFull: false), createdAt: .now,
                updatedAt: .now),
            InventoryItem(
                id: "lamp", revision: 1, seq: 2, name: "Lamp", typeKey: nil,
                placement: .container("crate"), createdAt: .now, updatedAt: .now),
        ])
    }

    private static func item(_ id: String, in store: InMemoryInventoryStore) async throws
        -> InventoryItem?
    {
        var iterator = store.observe(.item(id: id)).makeAsyncIterator()
        return try #require(await iterator.next())
    }

    @Test("deleting a container tombstones it and puts its contents in hand remembering it")
    func deletingAContainerEmptiesIt() async throws {
        let store = Self.store()

        _ = try await store.perform(.deleteItem(id: "crate"))

        #expect(try await Self.item("crate", in: store)?.isDeleted == true)
        let lamp = try await Self.item("lamp", in: store)
        #expect(lamp?.placement == .hand)
        #expect(lamp?.previousPlacement == .container("crate"))
    }

    @Test("undoing a delete restores the container and puts its contents back inside")
    func undoRestoresTheContents() async throws {
        let store = Self.store()

        let receipt = try await store.perform(.deleteItem(id: "crate"))
        try await store.undo(receipt)

        #expect(try await Self.item("crate", in: store)?.deletedAt == nil)
        #expect(try await Self.item("lamp", in: store)?.placement == .container("crate"))
    }

    @Test("deleting an item that is already deleted is refused")
    func deletingTwiceFails() async throws {
        let store = Self.store()
        _ = try await store.perform(.deleteItem(id: "crate"))

        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await store.perform(.deleteItem(id: "crate"))
        }
    }
}
