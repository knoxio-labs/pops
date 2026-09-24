import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// ``CatalogueRebase``: which logged changes may move from the revision they
/// were authored against onto a newer one, judged on the schema alone.
@Suite("Catalogue rebase")
internal struct CatalogueRebaseTests {
    private typealias Fixture = RebaseFixture

    @Test("a relabelled field moves, carrying the new revision in the command")
    func relabelMoves() throws {
        var renamed = Fixture.baseFields
        renamed[0] = Fixture.field(
            Fixture.lumens, key: "lumens", label: "Brightness", kind: .measurement, sortOrder: 0)

        let verdict = try Fixture.verdict(
            Fixture.edit(Fixture.lumens, try Fixture.measurement()), next: renamed)

        #expect(
            verdict
                == .rebased(
                    .command(
                        .editProtocol2Item(
                            id: Fixture.lampId, catalogueRevision: 2,
                            values: [
                                InventoryProtocol2FieldPatch(
                                    fieldId: Fixture.lumens, values: [try Fixture.measurement()])
                            ])), revision: 2))
    }

    @Test("an archived field does not move")
    func archivedFieldRefused() throws {
        var archived = Fixture.baseFields
        archived[0] = Fixture.field(
            Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0,
            archivedAt: "2026-09-02T00:00:00.000Z")

        let verdict = try Fixture.verdict(
            Fixture.edit(Fixture.lumens, try Fixture.measurement()), next: archived)

        #expect(verdict == .incompatible([Fixture.change(.field, Fixture.lumens, .archived)]))
    }

    @Test("a field that is gone does not move")
    func removedFieldRefused() throws {
        let verdict = try Fixture.verdict(
            Fixture.edit(Fixture.lumens, try Fixture.measurement()), next: [Fixture.baseFields[1]])

        #expect(verdict == .incompatible([Fixture.change(.field, Fixture.lumens, .notInRevision)]))
    }

    @Test("a field whose kind changed does not move")
    func kindChangeRefused() throws {
        var changed = Fixture.baseFields
        changed[0] = Fixture.field(Fixture.lumens, key: "lumens", kind: .decimal, sortOrder: 0)

        let verdict = try Fixture.verdict(
            Fixture.edit(Fixture.lumens, try Fixture.measurement()), next: changed)

        #expect(verdict == .incompatible([Fixture.change(.field, Fixture.lumens, .redefined)]))
    }

    @Test("an archived enum option does not move")
    func archivedOptionRefused() throws {
        var archived = Fixture.baseFields
        archived[1] = Fixture.field(
            Fixture.colour, key: "colour", kind: .enumeration, sortOrder: 1,
            options: [Fixture.option(archivedAt: "2026-09-02T00:00:00.000Z")])

        let verdict = try Fixture.verdict(
            Fixture.edit(Fixture.colour, .enumeration(optionId: Fixture.warm)), next: archived)

        #expect(
            verdict
                == .incompatible([
                    Fixture.change(.option, Fixture.warm, .retired, fieldId: Fixture.colour)
                ]))
    }

    @Test("a create does not move onto a revision that made a field it leaves out required")
    func newRequiredFieldRefusesCreate() throws {
        var required = Fixture.baseFields
        required[1] = Fixture.field(
            Fixture.colour, key: "colour", kind: .enumeration, sortOrder: 1, required: true,
            options: [Fixture.option()])
        let create = InventoryCommand.createProtocol2Item(
            InventoryNewProtocol2Item(
                id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Bulb", catalogueRevision: 1,
                typeId: Fixture.typeId,
                values: [
                    InventoryProtocol2FieldValue(
                        fieldId: Fixture.lumens, values: [try Fixture.measurement()])
                ], placement: .hand))

        let verdict = try Fixture.verdict(create, next: required)

        #expect(verdict == .incompatible([Fixture.change(.field, Fixture.colour, .nowRequired)]))
    }

    @Test("a command that names no catalogue record moves unchanged, still with no revision")
    func protocol1CommandMoves() throws {
        let quantity = InventoryCommand.setItemQuantity(id: Fixture.lampId, quantity: 3)

        let verdict = try Fixture.verdict(quantity, next: Fixture.baseFields)

        #expect(verdict == .rebased(.command(quantity), revision: nil))
    }

    @Test("a split, judged against the active catalogue, moves onto the newer revision")
    func splitMovesOntoActiveRevision() throws {
        let split = InventoryCommand.splitItem(id: Fixture.lampId, newItemId: "lamp-2", quantity: 1)

        let verdict = try Fixture.verdict(split, next: Fixture.baseFields)

        #expect(verdict == .rebased(.command(split), revision: 2))
    }
}

/// A catalogue revision fetched again must compare equal to the stored one
/// whatever order the server lists its types, fields and options in.
@Suite("Catalogue revision stored order")
internal struct CatalogueStoredOrderTests {
    @Test("a revision refetched in the server's own order is accepted as the same revision")
    func refetchInAnotherOrder() throws {
        let typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        let fields = [
            InventoryCatalogueField(
                id: "f-z", typeId: typeId, key: "zeta", label: "Zeta", sortOrder: 2,
                kind: .shortText, cardinality: .one, required: false, storage: .stored),
            InventoryCatalogueField(
                id: "f-a", typeId: typeId, key: "alpha", label: "Alpha", sortOrder: 1,
                kind: .shortText, cardinality: .one, required: false, storage: .stored),
        ]
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "bulb", label: "Bulb", sortOrder: 0, fields: fields)
            ])
        let replica = try InventoryReplica()
        try replica.store(catalogue)

        try replica.store(catalogue)

        #expect(
            try replica.catalogue(revision: 3)?.types.first?.fields.map(\.id) == ["f-a", "f-z"])
    }

    @Test("a revision that really changed is still refused")
    func changedRevisionRefused() throws {
        let typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        func catalogue(label: String) -> InventoryCatalogueSnapshot {
            InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
                types: [InventoryCatalogueType(id: typeId, key: "bulb", label: label, sortOrder: 0)]
            )
        }
        let replica = try InventoryReplica()
        try replica.store(catalogue(label: "Bulb"))

        #expect(throws: InventoryReplicaError.self) { try replica.store(catalogue(label: "Lamp")) }
    }
}
