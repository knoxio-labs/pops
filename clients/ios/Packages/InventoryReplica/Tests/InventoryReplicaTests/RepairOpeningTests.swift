import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Repairs: what opens one")
internal struct RepairOpeningTests {
    @Test("a field conflict opens one repair with both sides; its dependents stay held behind it")
    func conflictOpensOneRepair() throws {
        let replica = try MutationLogPerformTests.replica()
        try RepairFixture.rename(replica)
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 3), mutationId: "m2",
            clientTime: RepairFixture.time)

        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)

        let ledger = try replica.ledger
        #expect(
            ledger.repairs == [
                InventoryRepair(
                    id: "m1", entityKind: .item, entityId: "lamp", kind: .conflict,
                    field: "name",
                    options: [
                        InventoryRepairOption(
                            value: "Desk lamp", source: .thisDevice, at: RepairFixture.time),
                        InventoryRepairOption(
                            value: "Floor lamp", source: .otherDevice(label: "iPad"),
                            at: Fixture.created.addingTimeInterval(30)),
                    ], openedAt: Fixture.created)
            ])
        #expect(ledger.waiting.map(\.id) == ["m2"])
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.item(id: "lamp"))?.name == "Lamp")
    }

    @Test("a code collision carries who holds the code, the code tried and the suggestion")
    func codeCollisionCarriesHolder() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .setItemCode(id: "lamp", code: "B412"), mutationId: "m1",
            clientTime: RepairFixture.time)

        try RepairFixture.record(
            .conflictCodeCollision(heldById: "k9", heldByName: "Kitchen 09", suggestedCode: "B413"),
            for: "m1", on: replica)

        let repair = try #require(try replica.ledger.repairs.first)
        #expect(repair.kind == .codeCollision)
        #expect(repair.heldByName == "Kitchen 09")
        #expect(repair.suggestedCode == "B413")
        #expect(repair.options.map(\.value) == ["B412"])
    }

    @Test(
        "a refusal is a Let-go-only repair carrying its reason; media missing on an attach is a failed photo"
    )
    func rejectionsOpenRepairs() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .moveItem(id: "lamp", to: .location("hall"), verb: .move), mutationId: "m1",
            clientTime: RepairFixture.time)
        _ = try replica.perform(
            .attachPhoto(itemId: "mug", sha256: RepairFixture.photo, position: 0),
            mutationId: "m2", clientTime: RepairFixture.time)

        try RepairFixture.record(.rejected(reason: .cycle, message: "loop"), for: "m1", on: replica)
        try RepairFixture.record(
            .rejected(reason: .mediaMissing, message: "upload first"), for: "m2", on: replica)

        #expect(try replica.ledger.repairs.map(\.kind) == [.unrecognised("cycle"), .photoFailed])
    }

    @Test("applied and deferred outcomes open nothing; a converged one is listed as resolved")
    func appliedOpensNothing() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 3), mutationId: "m1",
            clientTime: RepairFixture.time)
        _ = try replica.perform(
            .setItemQuantity(id: "mug", quantity: 2), mutationId: "m2",
            clientTime: RepairFixture.time)

        try RepairFixture.record(
            .applied(revision: 6, seq: 11, converged: true), for: "m1", on: replica)
        try RepairFixture.record(.deferred(waitingOn: "x"), for: "m2", on: replica)

        let ledger = try replica.ledger
        #expect(ledger.repairs.isEmpty)
        #expect(
            ledger.resolved == [
                InventoryResolvedEntry(
                    id: "m1", entityId: "lamp", outcome: "Same count on both",
                    resolvedAt: Fixture.created)
            ])
    }

    @Test("the ledger marks a change in the drain's batch as syncing, and only that one")
    func inFlightShowsProgress() throws {
        let replica = try MutationLogPerformTests.replica()
        try RepairFixture.rename(replica)
        _ = try replica.perform(
            .setItemQuantity(id: "mug", quantity: 3), mutationId: "m2",
            clientTime: RepairFixture.time)

        try replica.markSending(["m1"], at: RepairFixture.time)

        #expect(try replica.ledger.waiting.map(\.progress) == [0, nil])
    }
}
