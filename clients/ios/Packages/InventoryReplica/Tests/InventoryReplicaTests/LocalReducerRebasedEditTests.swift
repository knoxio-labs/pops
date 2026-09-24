import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// POPS-4354: a protocol-2 edit moved onto a newer catalogue revision, while
/// the item's own row has not itself caught up to that revision, used to be
/// refused by the local reducer on replay — the phone showed the edit only
/// once the server applied it and it synced back. The reducer now reads the
/// item's stored values through the same compatibility judgement
/// ``CatalogueRebase``/``CatalogueCompatibility`` apply to a queued command,
/// and refuses only when that judgement genuinely finds something in the way.
@Suite("Local reducer: an edit rebased ahead of its item's own revision")
internal struct LocalReducerRebasedEditTests {
    private typealias Setup = LocalComputedFixture

    private static func relabelling(_ fieldId: String, to label: String)
        -> (InventoryCatalogueField) -> InventoryCatalogueField
    {
        { field in
            guard field.id == fieldId else { return field }
            return InventoryCatalogueField(
                id: field.id, typeId: field.typeId, key: field.key, label: label,
                help: field.help, sortOrder: field.sortOrder, kind: field.kind,
                cardinality: field.cardinality, required: field.required, storage: field.storage,
                fixedUnit: field.fixedUnit, references: field.references,
                expressionVersion: field.expressionVersion, expression: field.expression,
                allowOverride: field.allowOverride, presentation: field.presentation,
                archivedAt: field.archivedAt, enumOptions: field.enumOptions)
        }
    }

    private static func archiving(_ fieldId: String)
        -> (InventoryCatalogueField) -> InventoryCatalogueField
    {
        { field in
            guard field.id == fieldId else { return field }
            return InventoryCatalogueField(
                id: field.id, typeId: field.typeId, key: field.key, label: field.label,
                help: field.help, sortOrder: field.sortOrder, kind: field.kind,
                cardinality: field.cardinality, required: field.required, storage: field.storage,
                fixedUnit: field.fixedUnit, references: field.references,
                expressionVersion: field.expressionVersion, expression: field.expression,
                allowOverride: field.allowOverride, presentation: field.presentation,
                archivedAt: "2026-09-24T00:00:00.000Z", enumOptions: field.enumOptions)
        }
    }

    private static func publish(
        _ replica: InventoryReplica, revision: Int,
        _ change: (InventoryCatalogueField) -> InventoryCatalogueField
    ) throws {
        let types = Setup.catalogue.types.map { type in
            InventoryCatalogueType(
                id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                fields: type.fields.map(change))
        }
        try replica.store(
            InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
                types: types))
    }

    private static func width(of replica: InventoryReplica) throws -> InventoryPrimitiveValue? {
        guard
            case .value(let values)? = try replica.read(.item(id: Setup.box))?.fieldValues
                .first(where: { $0.fieldId == Setup.width })?.state
        else { return nil }
        return values.first
    }

    @Test("a compatible rename lets the drain rebase show the edit before the server answers")
    func drainRebaseShowsTheEditLocally() throws {
        let replica = try LocalComputedValueTests.replica()
        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .rejected(reason: .catalogueUpdateRequired, message: "x")],
                highWaterSeq: 12), mintMutationId: { "m2" })
        try Self.publish(
            replica, revision: Setup.revision + 1, Self.relabelling(Setup.width, to: "Width (cm)"))
        #expect(try replica.read(.item(id: Setup.box))?.catalogueRevision == Setup.revision)

        try replica.moveChangesAwaitingCatalogue()

        let sent = try #require(try replica.outboundMutations().first)
        #expect(sent.catalogueRevision == Setup.revision + 1)
        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try Self.width(of: replica) == (try Setup.decimal("4.0")))
        #expect(try replica.read(.item(id: Setup.box))?.catalogueRevision == Setup.revision + 1)
    }

    @Test(
        "an incompatible rename still refuses the rebase, and the local view keeps the server's value"
    )
    func drainRebaseStillRefusesIncompatibleChange() throws {
        let replica = try LocalComputedValueTests.replica()
        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .rejected(reason: .catalogueUpdateRequired, message: "x")],
                highWaterSeq: 12), mintMutationId: { "m2" })
        try Self.publish(replica, revision: Setup.revision + 1, Self.archiving(Setup.width))

        try replica.moveChangesAwaitingCatalogue()

        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.ledger.repairs.map(\.id) == ["m2"])
        #expect(try Self.width(of: replica) == (try Setup.decimal("2.0")))
        #expect(try replica.read(.item(id: Setup.box))?.catalogueRevision == Setup.revision)
    }

    @Test("a catalogue-repair Edit item replacement shows immediately too")
    func repairEditItemShowsTheReplacementLocally() throws {
        let replica = try LocalComputedValueTests.replica()
        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")
        let widthArchived = InventoryCatalogueChange(
            definition: .field, id: Setup.width, typeId: Setup.typeId, fieldId: Setup.width,
            change: .archived, revision: Setup.revision)
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: [
                    "m1": .rejected(
                        reason: .catalogueRepairRequired, message: "x",
                        catalogueChanges: [widthArchived])
                ], highWaterSeq: 12))
        try Self.publish(
            replica, revision: Setup.revision + 1, Self.relabelling(Setup.width, to: "Width (cm)"))
        let replacement = InventoryCommand.editProtocol2Item(
            id: Setup.box, catalogueRevision: Setup.revision + 1,
            values: [
                InventoryProtocol2FieldPatch(
                    fieldId: Setup.width, values: [try Setup.decimal("9.0")])
            ])

        try replica.resolve("m1", with: .replaceMine(replacement), minting: ["m2"])

        #expect(try replica.ledger.repairs.isEmpty)
        let sent = try #require(try replica.outboundMutations().first)
        #expect(sent.mutationId == "m2")
        #expect(sent.catalogueRevision == Setup.revision + 1)
        #expect(try Self.width(of: replica) == (try Setup.decimal("9.0")))
        #expect(try replica.read(.item(id: Setup.box))?.catalogueRevision == Setup.revision + 1)
    }
}
