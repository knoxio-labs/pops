import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Repairs: Undo after Keep mine")
internal struct RepairUndoTests {
    private static let original = InventoryReceipt(
        mutationId: "m1", entityKind: .item, entityId: "lamp")

    private static func keptMine() throws -> InventoryReplica {
        let replica = try MutationLogPerformTests.replica()
        try RepairFixture.rename(replica)
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)
        try replica.resolve("m1", with: .keepMine(), minting: ["k1"])
        return replica
    }

    @Test("Undo on the original receipt cancels the change Keep mine sent again")
    func undoFollowsTheReissue() throws {
        let replica = try Self.keptMine()
        #expect(try replica.outboundMutations().map(\.mutationId) == ["k1"])

        try replica.undo(Self.original, undoMutationId: "u1", clientTime: RepairFixture.time)

        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.logEntry("k1") == nil)
        #expect(try replica.read(.item(id: "lamp"))?.name == "Lamp")
    }

    @Test("Undo follows a change re-sent twice, to the latest id")
    func undoFollowsAChain() throws {
        let replica = try Self.keptMine()
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "k1", on: replica)
        try replica.resolve("k1", with: .keepMine(), minting: ["k2"])
        #expect(try replica.outboundMutations().map(\.mutationId) == ["k2"])

        try replica.undo(Self.original, undoMutationId: "u1", clientTime: RepairFixture.time)

        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.logEntry("k2") == nil)
    }

    @Test("Undo after Let go has nothing to undo, as the change is gone")
    func undoAfterLetGo() throws {
        let replica = try MutationLogPerformTests.replica()
        try RepairFixture.rename(replica)
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)
        try replica.resolve("m1", with: .discardMine, minting: [])

        #expect(throws: InventoryCommandError.nothingToUndo) {
            try replica.undo(Self.original, undoMutationId: "u1", clientTime: RepairFixture.time)
        }
    }
}
