import AppCore
import Testing

@testable import InventoryReplica

@Suite("Repairs: what the drain sends after one", .timeLimit(.minutes(1)))
internal struct RepairDrainTests {
    @Test("keep mine through the store re-sends the change under a fresh id with currentRevision")
    func keepMineResendsWithFreshBase() async throws {
        let replica = try MutationLogPerformTests.replica()
        let store = LocalFirstInventoryStore(
            replica: replica, transport: FakeSyncTransport(FakeSyncTransport.Script()),
            mintMutationId: SyncFixture.mutationIds(), now: { RepairFixture.time })
        let receipt = try await store.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]))
        let harness = DrainHarness(
            replica: replica,
            submit: DrainFixture.answering([receipt.mutationId: RepairFixture.renamedOnIPad]))
        #expect(await harness.drain.drainNow() == .drained)

        try await store.resolve(receipt.mutationId, with: .keepMine())
        #expect(await harness.drain.drainNow() == .drained)

        let sent = harness.transport.calls.submitted
        #expect(sent.map(\.mutationId) == [receipt.mutationId, "mutation-2"])
        #expect(sent.map(\.baseRevision) == [4, 6])
        #expect(sent.last?.command == sent.first?.command)
        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try replica.logEntry("mutation-2")?.state == .applied)
    }

    @Test("Restore sends item.restoreDeleted, then the original change depending on it")
    func restoreThenOriginal() async throws {
        let replica = try MutationLogPerformTests.replica()
        try RepairFixture.rename(replica)
        let harness = DrainHarness(
            replica: replica, submit: DrainFixture.answering(["m1": RepairFixture.deletedOnIPad]))
        #expect(await harness.drain.drainNow() == .drained)
        try replica.apply(
            Fixture.changes(items: [
                InventoryItem(
                    id: "lamp", revision: 6, seq: 6, name: "Lamp", typeKey: nil, placement: .hand,
                    containment: nil, createdAt: Fixture.created, updatedAt: Fixture.created,
                    deletedAt: Fixture.created)
            ]))
        #expect(try replica.read(.item(id: "lamp")) == nil)

        try replica.resolve("m1", with: .keepMine(), minting: ["restore", "again"])
        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
        #expect(await harness.drain.drainNow() == .drained)

        let sent = harness.transport.calls.submitted.dropFirst()
        #expect(sent.map(\.mutationId) == ["restore", "again"])
        #expect(sent.first?.command == .restoreDeletedItem(id: "lamp"))
        #expect(
            sent.last?.command
                == .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]))
        #expect(sent.last?.dependsOn == ["restore"])
        #expect(try replica.ledger.resolved.map(\.outcome) == ["Restored"])
    }

    @Test("a repair the feed shows settled elsewhere moves to resolved, releasing what it held")
    func feedResolvesRepair() async throws {
        let replica = try MutationLogPerformTests.replica()
        try RepairFixture.rename(replica)
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 3), mutationId: "m2",
            clientTime: RepairFixture.time)
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)

        try replica.apply(
            Fixture.changes(items: [Fixture.item("lamp", name: "Floor lamp", revision: 6)]))
        #expect(try replica.ledger.repairs.map(\.id) == ["m1"])

        try replica.apply(
            Fixture.changes(items: [Fixture.item("lamp", name: "Desk lamp", revision: 7)]))

        let ledger = try replica.ledger
        #expect(ledger.repairs.isEmpty)
        #expect(
            ledger.resolved == [
                InventoryResolvedEntry(
                    id: "m1", entityId: "lamp", outcome: "Already resolved elsewhere",
                    resolvedAt: Fixture.created)
            ])
        #expect(try replica.logEntry("m1") == nil)
        #expect(try replica.outboundMutations().map(\.dependsOn) == [[]])
        #expect(throws: InventoryCommandError.repairNotFound("m1")) {
            try replica.resolve("m1", with: .keepMine(), minting: ["k1"])
        }
    }
}
