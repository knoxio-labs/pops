import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// Edit item on a `catalogueChanged` repair (POPS-4494): the change edited
/// against the current fields takes the held change's place in the queue.
@Suite("Catalogue repair: edited change")
internal struct CatalogueRepairEditTests {
    private typealias Setup = LocalComputedFixture

    private static let widthArchived = InventoryCatalogueChange(
        definition: .field, id: Setup.width, typeId: Setup.typeId, fieldId: Setup.width,
        change: .archived, revision: Setup.revision)

    /// The box's width edit `m1`, refused because width was archived.
    private static func repaired() throws -> InventoryReplica {
        let replica = try LocalComputedValueTests.replica()
        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: [
                    "m1": .rejected(
                        reason: .catalogueRepairRequired, message: "x",
                        catalogueChanges: [widthArchived])
                ], highWaterSeq: 12))
        return replica
    }

    private static func depthEdit() throws -> InventoryCommand {
        .editProtocol2Item(
            id: Setup.box, catalogueRevision: Setup.revision,
            values: [
                InventoryProtocol2FieldPatch(fieldId: Setup.depth, values: [try Setup.decimal("5")])
            ])
    }

    @Test("the edited change is sent in the held one's place, and the repair settles")
    func editedChangeReplacesTheHeldOne() throws {
        let replica = try Self.repaired()

        try replica.resolve("m1", with: .replaceMine(try Self.depthEdit()), minting: ["m2"])

        let ledger = try replica.ledger
        #expect(ledger.repairs.isEmpty)
        #expect(ledger.resolved.first?.outcome == "Sent with current fields")
        let sent = try replica.outboundMutations()
        #expect(sent.map(\.mutationId) == ["m2"])
        #expect(sent.first?.command == (try Self.depthEdit()))
        #expect(sent.first?.catalogueRevision == Setup.revision)
    }

    @Test("an edit that still uses what is in the way is refused, and the repair stays open")
    func editStillBlockedIsRefused() throws {
        let replica = try Self.repaired()
        let archivedWidth = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: Setup.revision + 1, minimumProtocol: 2),
            types: Setup.catalogue.types.map { type in
                InventoryCatalogueType(
                    id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                    fields: type.fields.map { field in
                        guard field.id == Setup.width else { return field }
                        return InventoryCatalogueField(
                            id: field.id, typeId: field.typeId, key: field.key, label: field.label,
                            sortOrder: field.sortOrder, kind: field.kind,
                            cardinality: field.cardinality, required: false, storage: .stored,
                            archivedAt: "2026-09-24T00:00:00.000Z")
                    })
            })
        try replica.store(archivedWidth)
        let stillWidth = InventoryCommand.editProtocol2Item(
            id: Setup.box, catalogueRevision: Setup.revision + 1,
            values: [
                InventoryProtocol2FieldPatch(fieldId: Setup.width, values: [try Setup.decimal("4")])
            ])

        #expect(throws: InventoryCommandError.self) {
            try replica.resolve("m1", with: .replaceMine(stillWidth), minting: ["m2"])
        }
        #expect(try replica.ledger.repairs.map(\.id) == ["m1"])
        #expect(try replica.outboundMutations().isEmpty)
    }

    @Test("only a catalogue repair takes an edited change")
    func otherRepairsRefuseAnEdit() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp", revision: 4)])
        try RepairFixture.rename(replica)
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)

        #expect(throws: InventoryCommandError.self) {
            try replica.resolve(
                "m1", with: .replaceMine(.setItemQuantity(id: "lamp", quantity: 2)),
                minting: ["m2"])
        }
        #expect(try replica.ledger.repairs.map(\.id) == ["m1"])
    }
}
