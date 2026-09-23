import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Replica: computed values evaluated on the phone")
internal struct LocalComputedValueTests {
    private typealias Setup = LocalComputedFixture

    /// A box 2.0 wide and 3 deep on a rack 40 deep, with the server's own
    /// evaluations of both computed fields.
    private static func replica(
        complete: Bool = true, catalogue: InventoryCatalogueSnapshot = Setup.catalogue
    )
        throws -> InventoryReplica
    {
        let replica = try InventoryReplica(now: { Setup.time })
        try replica.store(catalogue)
        var page = Setup.snapshot(try Setup.seededRows())
        if !complete {
            page = InventorySnapshotPage(
                epoch: page.epoch, highWaterSeq: page.highWaterSeq,
                catalogueVersion: page.catalogueVersion,
                total: 10, items: page.items, locations: [], nextCursor: "more",
                catalogueRevision: page.catalogueRevision)
        }
        try replica.apply(page)
        return replica
    }

    private static func edit(
        _ replica: InventoryReplica, _ itemId: String, _ fieldId: String,
        _ values: [InventoryPrimitiveValue]?, mutationId: String
    ) throws {
        _ = try replica.perform(
            .editProtocol2Item(
                id: itemId, catalogueRevision: Setup.revision,
                values: [InventoryProtocol2FieldPatch(fieldId: fieldId, values: values)]),
            mutationId: mutationId, clientTime: Setup.time)
    }

    @Test("the server's evaluation stands while nothing local has changed")
    func serverValueStands() throws {
        let replica = try Self.replica()

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("6.00"))
        )
    }

    @Test("an offline edit shows a freshly evaluated value, not Out of date")
    func offlineEditEvaluates() throws {
        let replica = try Self.replica()

        try Self.edit(replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("12.0"))
        )
    }

    @Test("editing an item another one reads re-evaluates the dependent")
    func dependencyEditReevaluatesDependent() throws {
        let replica = try Self.replica()

        try Self.edit(replica, Setup.rack, Setup.depth, [try Setup.decimal("55")], mutationId: "m1")

        #expect(
            try Setup.display(replica, Setup.box, Setup.shelfDepth)
                == .value(try Setup.decimal("55")))
        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("6.00"))
        )
    }

    @Test("clearing an input the expression reads makes the value unavailable")
    func missingInputIsUnavailable() throws {
        let replica = try Self.replica()

        try Self.edit(replica, Setup.box, Setup.depth, nil, mutationId: "m1")

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume)
                == .unavailable(reason: "missing_dependency", failedFieldId: Setup.depth))
    }

    @Test("a newer server evaluation replaces the phone's own")
    func serverWinsOnNewerRevision() throws {
        let replica = try Self.replica()
        try Self.edit(replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")
        let fromServer = Setup.item(
            Setup.box, revision: 2,
            values: [
                Setup.stored(Setup.width, try Setup.decimal("4.0")),
                Setup.stored(Setup.depth, try Setup.decimal("3")),
            ],
            computed: [
                Setup.ok(
                    Setup.volume, try Setup.decimal("99.0"), itemRevision: 2,
                    dependencies: [
                        InventoryValueDependency(
                            itemId: Setup.box, fieldId: Setup.width, revision: 2)
                    ],
                    traversed: [Setup.box])
            ])

        try replica.apply(Setup.changes([fromServer]))
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .applied(revision: 2, seq: 21, converged: true)], highWaterSeq: 21)
        )

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("99.0"))
        )
    }

    @Test("an override survives dependency edits, and clearing it evaluates again")
    func overridePreserved() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            .setComputedOverride(
                id: Setup.box, fieldId: Setup.volume, value: try Setup.decimal("50")),
            mutationId: "m1", clientTime: Setup.time)

        try Self.edit(replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m2")
        #expect(
            try Setup.display(replica, Setup.box, Setup.volume)
                == .overridden(try Setup.decimal("50")))

        _ = try replica.perform(
            .clearComputedOverride(id: Setup.box, fieldId: Setup.volume), mutationId: "m3",
            clientTime: Setup.time)
        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("12.0"))
        )
    }

    @Test("an item created offline is evaluated before the server has seen it")
    func offlineCreateEvaluates() throws {
        let replica = try Self.replica()

        _ = try replica.perform(
            .createProtocol2Item(
                InventoryNewProtocol2Item(
                    id: Setup.elsewhere, name: "Crate", catalogueRevision: Setup.revision,
                    typeId: Setup.typeId,
                    values: [
                        InventoryProtocol2FieldValue(
                            fieldId: Setup.width, values: [try Setup.decimal("0.5")]),
                        InventoryProtocol2FieldValue(
                            fieldId: Setup.depth, values: [try Setup.decimal("0.5")]),
                    ], placement: .hand)),
            mutationId: "m1", clientTime: Setup.time)

        #expect(
            try Setup.display(replica, Setup.elsewhere, Setup.volume)
                == .value(try Setup.decimal("0.25")))
    }

    @Test("a reference to an item not downloaded yet leaves the value Out of date")
    func unresolvedReferenceStaysOutOfDate() throws {
        let replica = try Self.replica(complete: false)
        let target = InventoryReferenceValue(targetKind: .item, targetId: Setup.elsewhere)

        try Self.edit(replica, Setup.box, Setup.shelf, [.reference(target)], mutationId: "m1")

        #expect(try Setup.display(replica, Setup.box, Setup.shelfDepth) == .outOfDate)
        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("6.0")))
    }

    @Test("a reference to an item the complete replica lacks is reference_missing")
    func missingReferenceIsUnavailable() throws {
        let replica = try Self.replica()
        let target = InventoryReferenceValue(targetKind: .item, targetId: Setup.elsewhere)

        try Self.edit(replica, Setup.box, Setup.shelf, [.reference(target)], mutationId: "m1")

        #expect(
            try Setup.display(replica, Setup.box, Setup.shelfDepth)
                == .unavailable(reason: "reference_missing", failedFieldId: Setup.depth))
    }

    @Test("an expression this build cannot parse leaves the value Out of date")
    func unknownSyntaxStaysOutOfDate() throws {
        let future = InventoryJSON.object([
            "op": .string("coalesce"),
            "args": .array([Setup.read(Setup.width), Setup.read(Setup.depth)]),
        ])
        let types = Setup.catalogue.types.map { type in
            InventoryCatalogueType(
                id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                fields: type.fields.map { field in
                    field.id == Setup.volume
                        ? Setup.field(
                            Setup.volume, key: "volume", kind: .decimal, expression: future)
                        : field
                })
        }
        let replica = try Self.replica(
            catalogue: InventoryCatalogueSnapshot(revision: Setup.catalogue.revision, types: types))

        try Self.edit(replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")

        #expect(try Setup.display(replica, Setup.box, Setup.volume) == .outOfDate)
    }
}
