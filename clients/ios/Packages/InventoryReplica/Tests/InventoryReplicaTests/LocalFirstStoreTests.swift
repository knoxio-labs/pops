import AppCore
import Foundation
import InventoryReplica
import Testing

@Suite("Local-first store")
internal struct LocalFirstStoreTests {
    @Test("perform returns after the local commit without touching the network, and Undo cancels")
    func performIsLocalAndUndoCancels() async throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("lamp", name: "Lamp", revision: 4)
        ])
        let transport = FakeSyncTransport(FakeSyncTransport.Script())
        let store = LocalFirstInventoryStore(
            replica: replica, transport: transport, mintMutationId: SyncFixture.mutationIds(),
            now: { Fixture.created })

        let receipt = try await store.perform(.setItemQuantity(id: "lamp", quantity: 6))

        #expect(
            receipt
                == InventoryReceipt(mutationId: "mutation-1", entityKind: .item, entityId: "lamp"))
        var iterator = store.observe(.item(id: "lamp")).makeAsyncIterator()
        #expect(await iterator.next()??.quantity.count == 6)
        #expect(transport.calls.submitted.isEmpty)
        #expect(try replica.outboundMutations().map(\.mutationId) == ["mutation-1"])

        try await store.undo(receipt)

        #expect(try replica.read(.item(id: "lamp"))?.quantity.count == 1)
        #expect(try replica.outboundMutations().isEmpty)
    }

    @Test("resolving a repair throws, since none is opened yet")
    func resolveThrows() async throws {
        let store = LocalFirstInventoryStore(
            replica: try InventoryReplica(),
            transport: FakeSyncTransport(FakeSyncTransport.Script()))

        await #expect(throws: InventoryCommandError.repairNotFound("r1")) {
            try await store.resolve("r1", with: .discardMine)
        }
    }
}
