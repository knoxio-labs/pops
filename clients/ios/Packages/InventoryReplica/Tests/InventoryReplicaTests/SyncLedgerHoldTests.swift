import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// The Sync ledger's waiting list says why a change is not moving: behind a
/// repair, or unreadable, without an unreadable row failing the whole read.
@Suite("Sync ledger holds")
internal struct SyncLedgerHoldTests {
    private static func renamed() throws -> InventoryReplica {
        let replica = try Fixture.downloaded(
            items: [Fixture.item("lamp", revision: 4), Fixture.item("kettle", revision: 2)])
        try RepairFixture.rename(replica, as: "m1")
        return replica
    }

    private static func dependent(_ replica: InventoryReplica, _ id: String, on: String) throws {
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 2), mutationId: id, clientTime: Fixture.created)
        try replica.write { db in
            var entry = try #require(try MutationLogRows.entry(mutationId: id, in: db))
            entry.dependsOn = [on]
            try MutationLogRows.update(entry, in: db)
        }
    }

    @Test("a change depending on one under repair, directly or not, waits on it; others do not")
    func behindRepair() throws {
        let replica = try Self.renamed()
        try Self.dependent(replica, "m2", on: "m1")
        try Self.dependent(replica, "m3", on: "m2")
        _ = try replica.perform(
            .setItemQuantity(id: "kettle", quantity: 5), mutationId: "m4",
            clientTime: Fixture.created)

        try RepairFixture.record(.rejected(reason: .cycle, message: "loop"), for: "m1", on: replica)

        let holds = Dictionary(
            uniqueKeysWithValues: try replica.ledger.waiting.map { ($0.id, $0.hold) })
        let expected: [String: InventoryQueueHold?] = [
            "m2": .behindRepair, "m3": .behindRepair, "m4": nil,
        ]
        #expect(holds == expected, "\(holds)")
    }

    @Test("an unreadable change is listed as stalled and the rest of the ledger still reads")
    func unreadableRowIsStalled() throws {
        let replica = try Self.renamed()
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 2), mutationId: "m2", clientTime: Fixture.created
        )
        try replica.write { db in
            try db.execute(
                sql:
                    "UPDATE mutation_log SET command = '{\"fromAFutureBuild\":{}}' WHERE mutation_id = 'm1'"
            )
        }

        let ledger = try replica.ledger

        #expect(ledger.waiting.map(\.id) == ["m1", "m2"])
        let stuck = try #require(ledger.waiting.first)
        #expect(stuck.command == nil)
        #expect(stuck.hold == .stalled)
        #expect(stuck.receipt.entityId == "lamp")
        #expect(ledger.waiting.last?.hold == nil)
    }
}
