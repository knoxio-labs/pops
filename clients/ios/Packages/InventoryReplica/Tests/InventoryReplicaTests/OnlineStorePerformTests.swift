import AppCore
import Foundation
import InventoryReplica
import Testing

@Suite("Online store writes")
internal struct OnlineStorePerformTests {
    private static let lamp = Fixture.item("lamp", name: "Lamp", revision: 4)
    private static let hall = Fixture.location("hall", revision: 3)

    /// A downloaded store holding the lamp and the hall, whose feed then
    /// answers with `changes`.
    private static func store(
        changes: [InventoryItem] = [],
        submit: @escaping FakeSyncTransport.SubmitHandler
    ) async throws -> OnlineHarness {
        let replica = try InventoryReplica(now: { Fixture.created })
        var script = FakeSyncTransport.Script()
        script.snapshot = { _ in Fixture.snapshot(items: [lamp], locations: [hall]) }
        script.changes = { _, _ in Fixture.changes() }
        let transport = FakeSyncTransport(script)
        let store = OnlineInventoryStore(
            replica: replica, transport: transport, mintMutationId: SyncFixture.mutationIds(),
            now: { Fixture.created })
        try await store.download()
        transport.update {
            $0.submit = submit
            $0.changes = { _, _ in Fixture.changes(items: changes) }
        }
        return OnlineHarness(store: store, transport: transport, replica: replica)
    }

    @Test("perform leaves the replica alone until the server applies, then catches it up")
    func replicaUnchangedBeforeApplied() async throws {
        let gate = Gate()
        let renamed = Fixture.item("lamp", name: "Desk lamp", revision: 5)
        let harness = try await Self.store(changes: [renamed]) { batch in
            await gate.pass()
            return SyncFixture.applied(batch, revision: 5, seq: 21)
        }
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica

        let perform = Task {
            try await store.perform(
                .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]))
        }
        await gate.waitForArrival()
        #expect(try replica.read(.item(id: "lamp")) == Self.lamp)
        gate.open()
        let receipt = try await perform.value

        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
        #expect(
            receipt
                == InventoryReceipt(mutationId: "mutation-1", entityKind: .item, entityId: "lamp"))
        let sent = transport.calls.submitted
        #expect(sent.count == 1)
        #expect(sent.first?.baseRevision == 4)
        #expect(sent.first?.dependsOn == [])
        #expect(sent.first?.clientTime == Fixture.created)
    }

    @Test("a location command is based on the location's revision, a create on none")
    func baseRevisions() async throws {
        let harness = try await Self.store { batch in
            SyncFixture.applied(batch, revision: 4, seq: 22)
        }
        let store = harness.store
        let transport = harness.transport

        _ = try await store.perform(.renameLocation(id: "hall", name: "Hallway"))
        _ = try await store.perform(
            .createItem(InventoryNewItem(id: "new", name: "Mug", typeKey: nil, placement: .hand)))

        #expect(transport.calls.submitted.map(\.baseRevision) == [3, nil])
    }

    @Test("a field conflict is thrown with both sides, and the replica is untouched")
    func fieldConflictThrows() async throws {
        let at = Fixture.created.addingTimeInterval(60)
        let harness = try await Self.store(
            submit: SyncFixture.answering(
                .conflictField(
                    field: "placement", mine: "hall", theirs: "garage",
                    source: .otherDevice(label: "iPad"), at: at, currentRevision: 6)))
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica
        let feedRequestsBefore = transport.calls.changesSince.count

        await #expect(
            throws: InventoryCommandError.fieldConflict(
                field: "placement", mine: "hall", theirs: "garage",
                source: .otherDevice(label: "iPad"), at: at, currentRevision: 6)
        ) {
            try await store.perform(.moveItem(id: "lamp", to: .location("hall"), verb: .move))
        }
        #expect(try replica.read(.item(id: "lamp")) == Self.lamp)
        #expect(transport.calls.changesSince.count == feedRequestsBefore)
    }

    @Test("every other non-applied outcome is thrown as its own typed error")
    func otherOutcomesThrow() async throws {
        let cases: [(InventoryMutationOutcome, InventoryCommandError)] = [
            (
                .conflictCodeCollision(heldById: "b1", heldByName: "Box", suggestedCode: "B2"),
                InventoryCommandError.codeCollision(
                    heldById: "b1", heldByName: "Box", suggestedCode: "B2")
            ),
            (
                .conflictDeleted(source: .web, at: Fixture.created),
                InventoryCommandError.deletedElsewhere(source: .web, at: Fixture.created)
            ),
            (
                .rejected(reason: .cycle, message: "into itself"),
                InventoryCommandError.rejected(reason: .cycle, message: "into itself")
            ),
        ]
        for (outcome, expected) in cases {
            let harness = try await Self.store(submit: SyncFixture.answering(outcome))
            let store = harness.store
            let replica = harness.replica
            await #expect(throws: expected) {
                try await store.perform(.setItemCode(id: "lamp", code: "B1"))
            }
            #expect(try replica.read(.item(id: "lamp")) == Self.lamp)
        }
    }

    @Test("a lone mutation deferred on a dependency is a contract mismatch")
    func deferredIsMismatch() async throws {
        let harness = try await Self.store(
            submit: SyncFixture.answering(.deferred(waitingOn: "m-0")))
        let store = harness.store

        await #expect(throws: RepositoryError.contractMismatch) {
            try await store.perform(.setItemCode(id: "lamp", code: "B1"))
        }
    }

    @Test("a write the server never answered is thrown, and the replica shows offline")
    func unreachableWrite() async throws {
        let harness = try await Self.store { _ in
            throw RepositoryError.transport("offline")
        }
        let store = harness.store
        let replica = harness.replica

        await #expect(throws: RepositoryError.transport("offline")) {
            try await store.perform(.setItemQuantity(id: "lamp", quantity: 2))
        }
        #expect(try replica.read(.replicaStatus) == .offline(lastRefreshAt: Fixture.created))
    }

    @Test("a batch answer without this mutation's outcome is a contract mismatch")
    func missingOutcome() async throws {
        let harness = try await Self.store { _ in
            InventoryMutationBatchResult(outcomes: [:], highWaterSeq: 1)
        }
        let store = harness.store

        await #expect(throws: RepositoryError.contractMismatch) {
            try await store.perform(.setItemFull(id: "lamp", isFull: true))
        }
    }

    @Test("resolve has no repair to settle while writes wait for the server")
    func resolveHasNothing() async throws {
        let harness = try await Self.store { batch in
            SyncFixture.applied(batch, revision: 5, seq: 21)
        }
        let store = harness.store

        await #expect(throws: InventoryCommandError.repairNotFound("r-1")) {
            try await store.resolve("r-1", with: .discardMine)
        }
    }
}
