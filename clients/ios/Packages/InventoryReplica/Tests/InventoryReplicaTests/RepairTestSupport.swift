import AppCore
import Foundation
import Synchronization

@testable import InventoryReplica

internal enum RepairFixture {
    static let time = MutationLogPerformTests.time
    static let resolvedAt = time.addingTimeInterval(600)

    static let renamedOnIPad = InventoryMutationOutcome.conflictField(
        field: "name", mine: "Desk lamp", theirs: "Floor lamp",
        source: .otherDevice(label: "iPad"), at: Fixture.created.addingTimeInterval(30),
        currentRevision: 6)

    static let deletedOnIPad = InventoryMutationOutcome.conflictDeleted(
        source: .otherDevice(label: "iPad"), at: Fixture.created.addingTimeInterval(30))

    static let photo = String(repeating: "ab", count: 32)

    /// Answers `mutationId` as the server would have, without a drain.
    static func record(
        _ outcome: InventoryMutationOutcome, for mutationId: String, on replica: InventoryReplica
    ) throws {
        try replica.recordOutcomes(
            InventoryMutationBatchResult(outcomes: [mutationId: outcome], highWaterSeq: 12))
    }

    static func rename(_ replica: InventoryReplica, as mutationId: String = "m1") throws {
        _ = try replica.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
            mutationId: mutationId, clientTime: time)
    }

    /// Hands out `ids` in order, then fails the test by running out.
    static func minting(_ ids: [String]) -> @Sendable () -> String {
        let remaining = Mutex(ids)
        return { remaining.withLock { $0.removeFirst() } }
    }
}

extension InventoryReplica {
    func resolve(_ repairId: String, with choice: InventoryRepairChoice, minting ids: [String])
        throws
    {
        try resolve(
            repairId, with: choice, mintMutationId: RepairFixture.minting(ids),
            at: RepairFixture.resolvedAt)
    }

    var ledger: InventoryReplicaSyncLedger {
        get throws { try read(.syncLedger) }
    }
}
