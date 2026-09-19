import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("InMemoryInventoryStore sync seams")
internal struct InMemoryInventoryStoreSyncSeamsTests {
    private static let hall = InventoryNewLocation(
        id: "loc-1", name: "Hall", parentId: nil, sortOrder: 0)

    private static func waiting(_ mutationId: String) -> InventoryQueuedMutation {
        InventoryQueuedMutation(
            receipt: InventoryReceipt(
                mutationId: mutationId, entityKind: .item, entityId: "item-1"),
            command: .setItemQuantity(id: "item-1", quantity: 2), enqueuedAt: .now)
    }

    @Test("a staged waiting mutation is listed, moves in and out of the batch, and is removed")
    func waitingMutationLifecycle() async throws {
        let store = InMemoryInventoryStore()
        var iterator = store.observe(.syncLedger).makeAsyncIterator()
        _ = await iterator.next()

        store.addWaitingMutation(Self.waiting("m1"))
        #expect(try #require(await iterator.next()).waiting.map(\.progress) == [nil])

        store.setWaitingMutationProgress(mutationId: "m1", progress: 0.5)
        #expect(try #require(await iterator.next()).waiting.map(\.progress) == [0.5])

        store.setWaitingMutationProgress(mutationId: "unknown", progress: 1)
        #expect(try #require(await iterator.next()).waiting.map(\.progress) == [0.5])

        store.removeWaitingMutation(mutationId: "m1")
        #expect(try #require(await iterator.next()).waiting.isEmpty)
    }

    @Test("storage full fails the next write once, then clears itself")
    func storageFullIsOneShot() async throws {
        let store = InMemoryInventoryStore()
        store.setStorageFull()

        await #expect(throws: InventoryStorageError.full) {
            try await store.download()
        }
        try await store.download()

        store.setStorageFull()
        await #expect(throws: InventoryStorageError.full) {
            _ = try await store.perform(.createLocation(Self.hall))
        }
        _ = try await store.perform(.createLocation(Self.hall))
    }
}
