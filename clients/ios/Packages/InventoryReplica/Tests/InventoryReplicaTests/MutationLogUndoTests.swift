import AppCore
import Testing

@testable import InventoryReplica

@Suite("Mutation log: Undo")
internal struct MutationLogUndoTests {
    private static let time = MutationLogPerformTests.time
    private static let crateId = MutationLogPerformTests.crateId

    private static func receipt(_ id: String, _ entityId: String = "lamp") -> InventoryReceipt {
        InventoryReceipt(mutationId: id, entityKind: .item, entityId: entityId)
    }

    @Test("Undo of an unsent change cancels it: the row shows its base and nothing is sent")
    func undoUnsentCancels() throws {
        let replica = try MutationLogPerformTests.replica()
        let receipt = try replica.perform(
            .moveItem(id: "lamp", to: .location("hall"), verb: .move), mutationId: "m1",
            clientTime: Self.time)

        try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)

        let lamp = try #require(try replica.read(.item(id: "lamp")))
        #expect(lamp.placement == .hand)
        #expect(lamp.revision == 4)
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.syncLedger).waiting.isEmpty)
    }

    @Test("cancelling a create cancels the changes logged on top of it")
    func cancelCascadesToDependents() throws {
        let replica = try MutationLogPerformTests.replica()
        let create = try replica.perform(
            .createItem(
                InventoryNewItem(id: Self.crateId, name: "Crate", typeKey: nil, placement: .hand)),
            mutationId: "create", clientTime: Self.time)
        _ = try replica.perform(
            .setItemCode(id: Self.crateId, code: "C1"), mutationId: "code", clientTime: Self.time)
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 3), mutationId: "other", clientTime: Self.time)

        try replica.undo(create, undoMutationId: "u1", clientTime: Self.time)

        #expect(try replica.read(.item(id: Self.crateId)) == nil)
        #expect(try replica.outboundMutations().map(\.mutationId) == ["other"])
        #expect(try replica.read(.item(id: "lamp"))?.quantity.count == 3)
    }

    @Test("Undo of an applied change logs a revert of its event, shown at once")
    func undoAppliedLogsRevert() throws {
        let replica = try MutationLogPerformTests.replica()
        let receipt = try replica.perform(
            .moveItem(id: "lamp", to: .location("hall"), verb: .move), mutationId: "m1",
            clientTime: Self.time)
        try replica.markSending(["m1"], at: Self.time)
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .applied(revision: 5, seq: 42, converged: false)],
                highWaterSeq: 42))

        try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)

        #expect(try replica.read(.item(id: "lamp"))?.placement == .hand)
        let sent = try #require(try replica.outboundMutations().first)
        #expect(sent.mutationId == "u1")
        #expect(sent.command == .revertEvent(seq: 42, entityKind: .item, entityId: "lamp"))
        #expect(sent.baseRevision == nil)
    }

    @Test("Undo of a change in flight is held back until its outcome names the event")
    func undoInFlightWaits() throws {
        let replica = try MutationLogPerformTests.replica()
        let receipt = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 3), mutationId: "m1", clientTime: Self.time)
        try replica.markSending(["m1"], at: Self.time)

        try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)

        #expect(try replica.read(.item(id: "lamp"))?.quantity.count == 1)
        #expect(try replica.outboundMutations().isEmpty)
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .applied(revision: 5, seq: 50, converged: false)],
                highWaterSeq: 50))
        let sent = try #require(try replica.outboundMutations().first)
        #expect(sent.command == .revertEvent(seq: 50, entityKind: .item, entityId: "lamp"))
        #expect(sent.dependsOn == ["m1"])
    }

    @Test("an applied create cannot be undone, as the server refuses to revert one")
    func appliedCreateIsIrreversible() throws {
        let replica = try MutationLogPerformTests.replica()
        let receipt = try replica.perform(
            .createItem(
                InventoryNewItem(id: Self.crateId, name: "Crate", typeKey: nil, placement: .hand)),
            mutationId: "create", clientTime: Self.time)
        try replica.markSending(["create"], at: Self.time)

        #expect(
            throws: InventoryCommandError.rejected(
                reason: .illegalTransition, message: "a created event cannot be reverted")
        ) {
            try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)
        }
    }

    @Test("Undo of a change the log does not hold has nothing to undo")
    func unknownReceipt() throws {
        let replica = try MutationLogPerformTests.replica()

        #expect(throws: InventoryCommandError.nothingToUndo) {
            try replica.undo(Self.receipt("missing"), undoMutationId: "u1", clientTime: Self.time)
        }
    }

    @Test("Undo of a sent change that altered nothing has nothing to undo")
    func sentNoOpHasNothingToUndo() throws {
        let replica = try MutationLogPerformTests.replica()
        let receipt = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 1), mutationId: "m1", clientTime: Self.time)
        try replica.markSending(["m1"], at: Self.time)

        #expect(throws: InventoryCommandError.nothingToUndo) {
            try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)
        }
    }
}
