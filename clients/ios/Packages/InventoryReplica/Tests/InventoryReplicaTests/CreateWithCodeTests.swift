import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// POPS-4063: a new item's code rides inside `item.create`, so a code another
/// item holds refuses the whole create, offline as on the server, and a
/// collision found only at sync is relabelled by re-sending the create.
@Suite("Local reducer: a create carrying its code")
internal struct CreateWithCodeTests {
    private static let newId = "30000000-0000-4000-8000-000000000009"

    private static func replicaWithHeldCode() throws -> InventoryReplica {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .setItemCode(id: "mug", code: "B412"), mutationId: "m0",
            clientTime: RepairFixture.time)
        return replica
    }

    private static func create(code: String) -> InventoryCommand {
        .createItem(
            InventoryNewItem(id: newId, name: "Kettle", typeKey: nil, placement: .hand, code: code))
    }

    @Test("a create wearing a free code lands with it")
    func freeCodeLands() throws {
        let replica = try Self.replicaWithHeldCode()

        _ = try replica.perform(
            Self.create(code: " B7 "), mutationId: "m1", clientTime: RepairFixture.time)

        #expect(try replica.read(.item(id: Self.newId))?.code == "B7")
    }

    @Test("a create wearing a held code is refused whole, naming the holder and a free code")
    func heldCodeRefusesCreate() throws {
        let replica = try Self.replicaWithHeldCode()

        #expect(
            throws: InventoryCommandError.codeCollision(
                heldById: "mug", heldByName: "Mug", suggestedCode: "b413")
        ) {
            try replica.perform(
                Self.create(code: "b412"), mutationId: "m1", clientTime: RepairFixture.time)
        }
        #expect(try replica.read(.item(id: Self.newId)) == nil)
        #expect(try replica.logEntry("m1") == nil)
    }

    @Test("a create that collided at sync is re-sent as the same create wearing the new code")
    func collidedCreateIsRelabelled() throws {
        for (chosen, expected) in [("B7", "B7"), (nil, "B413")] as [(String?, String)] {
            let replica = try MutationLogPerformTests.replica()
            _ = try replica.perform(
                Self.create(code: "B412"), mutationId: "m1", clientTime: RepairFixture.time)
            try RepairFixture.record(
                .conflictCodeCollision(
                    heldById: "k9", heldByName: "Kitchen 09", suggestedCode: "B413"),
                for: "m1", on: replica)
            #expect(try replica.ledger.repairs.first?.options.map(\.value) == ["B412"])

            try replica.resolve("m1", with: .keepMine(code: chosen), minting: ["k1"])

            #expect(
                try replica.outboundMutations().map(\.command) == [Self.create(code: expected)])
            #expect(try replica.read(.item(id: Self.newId))?.code == expected)
            #expect(try replica.ledger.resolved.map(\.outcome) == ["Relabelled \(expected)"])
        }
    }

    @Test("a create logged before creates carried a code still reads, as one without")
    func legacyLoggedCreateDecodes() throws {
        let stored = try StoredJSON.encode(StoredCommand(.command(Self.create(code: "B1"))))
        let legacy = stored.replacingOccurrences(of: #""code":"B1","#, with: "")
        #expect(legacy != stored)

        let decoded = try StoredJSON.decode(StoredCommand.self, from: legacy).logged()

        #expect(
            decoded
                == .command(
                    .createItem(
                        InventoryNewItem(
                            id: Self.newId, name: "Kettle", typeKey: nil, placement: .hand))))
    }
}
