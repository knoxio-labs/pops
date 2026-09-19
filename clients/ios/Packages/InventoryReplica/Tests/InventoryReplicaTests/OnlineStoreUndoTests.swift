import AppCore
import InventoryReplica
import Testing

@Suite("Online store undo")
internal struct OnlineStoreUndoTests {
    private static func store(
        submit: @escaping FakeSyncTransport.SubmitHandler
    ) async throws -> (OnlineInventoryStore, FakeSyncTransport) {
        let replica = try InventoryReplica(now: { Fixture.created })
        var script = FakeSyncTransport.Script()
        script.snapshot = { _ in
            Fixture.snapshot(
                items: [Fixture.item("lamp", revision: 4)], locations: [Fixture.location("hall")])
        }
        script.changes = { _, _ in Fixture.changes() }
        let transport = FakeSyncTransport(script)
        let store = OnlineInventoryStore(
            replica: replica, transport: transport, mintMutationId: SyncFixture.mutationIds())
        try await store.download()
        transport.update { $0.submit = submit }
        return (store, transport)
    }

    @Test("undo reverts the event the change wrote, filed under the change's entity")
    func undoRevertsTheWrittenEvent() async throws {
        let (store, transport) = try await Self.store { batch in
            SyncFixture.applied(batch, revision: 5, seq: 21)
        }
        let receipt = try await store.perform(
            .moveItem(id: "lamp", to: .location("hall"), verb: .putBack))

        try await store.undo(receipt)

        let revert = try #require(transport.calls.submitted.last)
        #expect(revert.command == .revertEvent(seq: 21, entityKind: .item, entityId: "lamp"))
        #expect(revert.baseRevision == nil)
        #expect(revert.mutationId == "mutation-2")
    }

    @Test("a change undone once cannot be undone again")
    func undoOnlyOnce() async throws {
        let (store, _) = try await Self.store { batch in
            SyncFixture.applied(batch, revision: 5, seq: 21)
        }
        let receipt = try await store.perform(.setItemQuantity(id: "lamp", quantity: 3))
        try await store.undo(receipt)

        await #expect(throws: InventoryCommandError.nothingToUndo) { try await store.undo(receipt) }
    }

    @Test("a change that wrote no event has nothing to revert")
    func noOpHasNothingToUndo() async throws {
        let (store, transport) = try await Self.store { batch in
            SyncFixture.applied(batch, revision: 4, seq: 10)
        }
        let receipt = try await store.perform(.setItemQuantity(id: "lamp", quantity: 1))

        await #expect(throws: InventoryCommandError.nothingToUndo) { try await store.undo(receipt) }
        #expect(transport.calls.submitted.count == 1)
    }

    @Test("a receipt this store never issued has nothing to revert")
    func foreignReceipt() async throws {
        let (store, _) = try await Self.store { batch in
            SyncFixture.applied(batch, revision: 5, seq: 21)
        }

        await #expect(throws: InventoryCommandError.nothingToUndo) {
            try await store.undo(
                InventoryReceipt(mutationId: "elsewhere", entityKind: .item, entityId: "lamp"))
        }
    }

    @Test("a revert the server refuses is thrown and stays undoable")
    func refusedRevertStaysUndoable() async throws {
        let (store, transport) = try await Self.store { batch in
            SyncFixture.applied(batch, revision: 5, seq: 21)
        }
        let receipt = try await store.perform(.renameLocation(id: "hall", name: "Hallway"))
        let refusal = InventoryMutationOutcome.conflictField(
            field: "name", mine: "hall", theirs: "Lobby", source: .web, at: Fixture.created,
            currentRevision: 7)
        transport.update { $0.submit = SyncFixture.answering(refusal) }

        await #expect(throws: InventoryCommandError.self) { try await store.undo(receipt) }

        transport.update {
            $0.submit = { batch in SyncFixture.applied(batch, revision: 8, seq: 30) }
        }
        try await store.undo(receipt)
        #expect(
            transport.calls.submitted.last?.command
                == .revertEvent(seq: 21, entityKind: .location, entityId: "hall"))
    }
}
