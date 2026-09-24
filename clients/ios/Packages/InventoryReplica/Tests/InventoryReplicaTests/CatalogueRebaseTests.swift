import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// ``CatalogueRebase``: which logged changes may move from the revision they
/// were authored against onto a newer one, judged on the schema alone.
@Suite("Catalogue rebase")
internal struct CatalogueRebaseTests {
    private static let typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private static let lumens = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    private static let colour = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    private static let warm = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    private static let lampId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"

    private static func field(
        _ id: String, key: String, label: String? = nil, kind: InventoryPrimitiveKind,
        sortOrder: Int, required: Bool = false, archivedAt: String? = nil,
        options: [InventoryCatalogueOption] = []
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: label ?? key, sortOrder: sortOrder,
            kind: kind, cardinality: .one, required: required, storage: .stored,
            archivedAt: archivedAt, enumOptions: options)
    }

    private static func option(archivedAt: String? = nil) -> InventoryCatalogueOption {
        InventoryCatalogueOption(
            id: warm, key: "warm", label: "Warm", sortOrder: 0, archivedAt: archivedAt)
    }

    private static let baseFields = [
        field(lumens, key: "lumens", kind: .measurement, sortOrder: 0),
        field(colour, key: "colour", kind: .enumeration, sortOrder: 1, options: [option()]),
    ]

    private static func catalogue(_ revision: Int, _ fields: [InventoryCatalogueField])
        -> InventoryCatalogueSnapshot
    {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "bulb", label: "Bulb", sortOrder: 0, fields: fields)
            ])
    }

    /// A replica holding the lamp at revision 1 and `next` as revision 2.
    private static func replica(next: [InventoryCatalogueField]) throws -> InventoryReplica {
        let replica = try InventoryReplica()
        let lamp = InventoryItem(
            id: lampId, revision: 1, seq: 1, catalogueRevision: 1, name: "Lamp", typeId: typeId,
            typeKey: "bulb", placement: .hand, createdAt: Fixture.created,
            updatedAt: Fixture.created)
        try replica.apply(
            InventorySnapshotPage(
                epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "c1", total: 1,
                items: [lamp], locations: [], nextCursor: nil, catalogueRevision: 1),
            catalogue: catalogue(1, baseFields))
        try replica.store(catalogue(2, next))
        return replica
    }

    private static func entry(_ command: InventoryCommand) -> LogEntry {
        LogEntry(
            localSeq: 1, mutationId: "m1", entity: EntityRef(kind: "item", id: lampId),
            command: .command(command), dependsOn: [], baseRevision: 1, catalogueRevision: 1,
            state: .queued, outcome: nil, settlesAtSeq: nil, touched: [], change: nil,
            attempts: 0, createdAt: 0, lastAttemptAt: nil)
    }

    private static func edit(_ fieldId: String, _ value: InventoryPrimitiveValue)
        -> InventoryCommand
    {
        .editProtocol2Item(
            id: lampId, catalogueRevision: 1,
            values: [InventoryProtocol2FieldPatch(fieldId: fieldId, values: [value])])
    }

    private static func verdict(_ command: InventoryCommand, next: [InventoryCatalogueField])
        throws -> CatalogueRebase.Verdict
    {
        let replica = try replica(next: next)
        return try replica.database.read { db in
            try CatalogueRebase.rebase(entry(command), onto: 2, in: db)
        }
    }

    private static func measurement() throws -> InventoryPrimitiveValue {
        .measurement(amount: try InventoryDecimal("900"), unit: "lm")
    }

    @Test("a relabelled field moves, carrying the new revision in the command")
    func relabelMoves() throws {
        var renamed = Self.baseFields
        renamed[0] = Self.field(
            Self.lumens, key: "lumens", label: "Brightness", kind: .measurement, sortOrder: 0)

        let verdict = try Self.verdict(
            Self.edit(Self.lumens, try Self.measurement()), next: renamed)

        #expect(
            verdict
                == .rebased(
                    .command(
                        .editProtocol2Item(
                            id: Self.lampId, catalogueRevision: 2,
                            values: [
                                InventoryProtocol2FieldPatch(
                                    fieldId: Self.lumens, values: [try Self.measurement()])
                            ])), revision: 2))
    }

    @Test("an archived field does not move")
    func archivedFieldRefused() throws {
        var archived = Self.baseFields
        archived[0] = Self.field(
            Self.lumens, key: "lumens", kind: .measurement, sortOrder: 0,
            archivedAt: "2026-09-02T00:00:00.000Z")

        let verdict = try Self.verdict(
            Self.edit(Self.lumens, try Self.measurement()), next: archived)

        #expect(verdict == .incompatible(reason: "field \(Self.lumens) was archived or replaced"))
    }

    @Test("a field that is gone does not move")
    func removedFieldRefused() throws {
        let verdict = try Self.verdict(
            Self.edit(Self.lumens, try Self.measurement()), next: [Self.baseFields[1]])

        guard case .incompatible = verdict else {
            Issue.record("expected incompatible, got \(verdict)")
            return
        }
    }

    @Test("a field whose kind changed does not move")
    func kindChangeRefused() throws {
        var changed = Self.baseFields
        changed[0] = Self.field(Self.lumens, key: "lumens", kind: .decimal, sortOrder: 0)

        let verdict = try Self.verdict(
            Self.edit(Self.lumens, try Self.measurement()), next: changed)

        #expect(verdict == .incompatible(reason: "field \(Self.lumens) changed kind"))
    }

    @Test("an archived enum option does not move")
    func archivedOptionRefused() throws {
        var archived = Self.baseFields
        archived[1] = Self.field(
            Self.colour, key: "colour", kind: .enumeration, sortOrder: 1,
            options: [Self.option(archivedAt: "2026-09-02T00:00:00.000Z")])

        let verdict = try Self.verdict(
            Self.edit(Self.colour, .enumeration(optionId: Self.warm)), next: archived)

        #expect(verdict == .incompatible(reason: "option \(Self.warm) was archived or replaced"))
    }

    @Test("a create does not move onto a revision that made a field it leaves out required")
    func newRequiredFieldRefusesCreate() throws {
        var required = Self.baseFields
        required[1] = Self.field(
            Self.colour, key: "colour", kind: .enumeration, sortOrder: 1, required: true,
            options: [Self.option()])
        let create = InventoryCommand.createProtocol2Item(
            InventoryNewProtocol2Item(
                id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Bulb", catalogueRevision: 1,
                typeId: Self.typeId,
                values: [
                    InventoryProtocol2FieldValue(
                        fieldId: Self.lumens, values: [try Self.measurement()])
                ], placement: .hand))

        let verdict = try Self.verdict(create, next: required)

        #expect(verdict == .incompatible(reason: "field \(Self.colour) is now required"))
    }

    @Test("a command that names no catalogue record moves unchanged, still with no revision")
    func protocol1CommandMoves() throws {
        let quantity = InventoryCommand.setItemQuantity(id: Self.lampId, quantity: 3)

        let verdict = try Self.verdict(quantity, next: Self.baseFields)

        #expect(verdict == .rebased(.command(quantity), revision: nil))
    }

    @Test("a split, judged against the active catalogue, moves onto the newer revision")
    func splitMovesOntoActiveRevision() throws {
        let split = InventoryCommand.splitItem(id: Self.lampId, newItemId: "lamp-2", quantity: 1)

        let verdict = try Self.verdict(split, next: Self.baseFields)

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
