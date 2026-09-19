import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Repairs: resolving on the phone")
internal struct RepairResolutionTests {
    /// A rename answered with a conflict, and a later change to the same item
    /// held behind it.
    private static func conflicted() throws -> InventoryReplica {
        let replica = try MutationLogPerformTests.replica()
        try RepairFixture.rename(replica)
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 3), mutationId: "m2",
            clientTime: RepairFixture.time)
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)
        return replica
    }

    @Test("keep mine logs the change again under a new id, in its place, based on currentRevision")
    func keepMineReissues() throws {
        let replica = try Self.conflicted()

        try replica.resolve("m1", with: .keepMine(), minting: ["k1"])
        try replica.apply(Fixture.changes())

        let sent = try replica.outboundMutations()
        #expect(sent.map(\.mutationId) == ["k1", "m2"])
        #expect(sent.first?.baseRevision == 6)
        #expect(sent.last?.dependsOn == ["k1"])
        #expect(try replica.logEntry("m1") == nil)
        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
        let ledger = try replica.ledger
        #expect(ledger.repairs.isEmpty)
        #expect(ledger.resolved.map(\.outcome) == ["Kept mine"])
    }

    @Test("keep mine stays based on currentRevision once the feed delivers a newer row")
    func keepMineFollowsTheFeed() throws {
        let replica = try Self.conflicted()
        try replica.resolve("m1", with: .keepMine(), minting: ["k1"])

        try replica.apply(
            Fixture.changes(items: [Fixture.item("lamp", name: "Floor lamp", revision: 6)]))

        #expect(try replica.outboundMutations().first?.baseRevision == 6)
        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
    }

    @Test(
        "discard mine drops the change, rebases on the server's row and releases what depended on it"
    )
    func discardMineRebases() throws {
        let replica = try Self.conflicted()
        try replica.apply(
            Fixture.changes(items: [Fixture.item("lamp", name: "Floor lamp", revision: 6)]))

        try replica.resolve("m1", with: .discardMine, minting: [])

        let lamp = try #require(try replica.read(.item(id: "lamp")))
        #expect(lamp.name == "Floor lamp")
        #expect(lamp.quantity.count == 3)
        #expect(try replica.logEntry("m1") == nil)
        let sent = try replica.outboundMutations()
        #expect(sent.map(\.mutationId) == ["m2"])
        #expect(sent.first?.dependsOn == [])
        #expect(try replica.ledger.resolved.map(\.outcome) == ["Discarded mine"])
    }

    @Test("a code collision is re-sent with the chosen code, or the suggestion when none is given")
    func newCode() throws {
        for (chosen, expected) in [("B7", "B7"), (nil, "B413")] as [(String?, String)] {
            let replica = try MutationLogPerformTests.replica()
            _ = try replica.perform(
                .setItemCode(id: "lamp", code: "B412"), mutationId: "m1",
                clientTime: RepairFixture.time)
            try RepairFixture.record(
                .conflictCodeCollision(
                    heldById: "k9", heldByName: "Kitchen 09", suggestedCode: "B413"),
                for: "m1", on: replica)

            try replica.resolve("m1", with: .keepMine(code: chosen), minting: ["k1"])

            #expect(
                try replica.outboundMutations().map(\.command) == [
                    .setItemCode(id: "lamp", code: expected)
                ])
            #expect(try replica.read(.item(id: "lamp"))?.code == expected)
            #expect(try replica.ledger.resolved.map(\.outcome) == ["Relabelled \(expected)"])
        }
    }

    @Test("a new code another item on this phone holds is refused, and the repair stays open")
    func newCodeTakenLocally() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .setItemCode(id: "mug", code: "B7"), mutationId: "m0", clientTime: RepairFixture.time)
        _ = try replica.perform(
            .setItemCode(id: "lamp", code: "B412"), mutationId: "m1", clientTime: RepairFixture.time
        )
        try RepairFixture.record(
            .conflictCodeCollision(heldById: "k9", heldByName: "Kitchen 09", suggestedCode: "B413"),
            for: "m1", on: replica)

        #expect(throws: InventoryCommandError.self) {
            try replica.resolve("m1", with: .keepMine(code: "B7"), minting: ["k1"])
        }

        #expect(try replica.ledger.repairs.map(\.id) == ["m1"])
        #expect(try replica.logEntry("m1")?.state == .conflicted)
    }

    @Test("a refusal offers only Let go: either choice drops the change")
    func refusalIsLetGo() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .moveItem(id: "lamp", to: .location("hall"), verb: .move), mutationId: "m1",
            clientTime: RepairFixture.time)
        try RepairFixture.record(.rejected(reason: .cycle, message: "loop"), for: "m1", on: replica)

        try replica.resolve("m1", with: .keepMine(), minting: [])

        #expect(try replica.logEntry("m1") == nil)
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.item(id: "lamp"))?.placement == .hand)
        #expect(try replica.ledger.resolved.map(\.outcome) == ["Let go"])
    }

    @Test("a failed photo is retried under a new id, or removed")
    func photoRetryAndRemove() throws {
        for (choice, outcome) in [
            (InventoryRepairChoice.keepMine(), "Photo retried"), (.discardMine, "Photo removed"),
        ] {
            let replica = try MutationLogPerformTests.replica()
            _ = try replica.perform(
                .attachPhoto(itemId: "mug", sha256: RepairFixture.photo, position: 0),
                mutationId: "m1", clientTime: RepairFixture.time)
            try RepairFixture.record(
                .rejected(reason: .mediaMissing, message: "upload first"), for: "m1", on: replica)

            try replica.resolve("m1", with: choice, minting: ["k1"])

            let retried = choice == .keepMine()
            #expect(try replica.outboundMutations().map(\.mutationId) == (retried ? ["k1"] : []))
            #expect(try replica.read(.item(id: "mug"))?.photos.isEmpty == !retried)
            #expect(try replica.ledger.resolved.map(\.outcome) == [outcome])
        }
    }

    @Test("a place deleted elsewhere cannot be restored; it can be let go")
    func deletedPlaceIsLetGoOnly() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .renameLocation(id: "hall", name: "Hallway"), mutationId: "m1",
            clientTime: RepairFixture.time)
        try RepairFixture.record(RepairFixture.deletedOnIPad, for: "m1", on: replica)

        #expect(throws: InventoryCommandError.self) {
            try replica.resolve("m1", with: .keepMine(), minting: ["k1", "k2"])
        }
        try replica.resolve("m1", with: .discardMine, minting: [])

        #expect(try replica.ledger.resolved.map(\.outcome) == ["Let go"])
    }

    @Test("resolving an id with no open repair throws, including one already resolved")
    func unknownRepair() throws {
        let replica = try Self.conflicted()
        try replica.resolve("m1", with: .discardMine, minting: [])

        for id in ["m1", "m2", "nothing"] {
            #expect(throws: InventoryCommandError.repairNotFound(id)) {
                try replica.resolve(id, with: .discardMine, minting: [])
            }
        }
    }
}
