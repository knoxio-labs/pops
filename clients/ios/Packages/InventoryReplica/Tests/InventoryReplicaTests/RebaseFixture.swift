import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// A lamp of one bulb type at catalogue revision 1, and a revision 2 each
/// test shapes, for ``CatalogueRebase`` and ``CatalogueReplacement``.
internal enum RebaseFixture {
    static let typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    static let lumens = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    static let colour = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    static let warm = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    static let lampId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"

    static func field(
        _ id: String, key: String, label: String? = nil, kind: InventoryPrimitiveKind,
        sortOrder: Int, required: Bool = false, archivedAt: String? = nil,
        options: [InventoryCatalogueOption] = [], fixedUnit: String? = nil,
        replacedBy: String? = nil
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: label ?? key, sortOrder: sortOrder,
            kind: kind, cardinality: .one, required: required, storage: .stored,
            fixedUnit: fixedUnit, archivedAt: archivedAt, replacedBy: replacedBy,
            enumOptions: options)
    }

    static func option(archivedAt: String? = nil) -> InventoryCatalogueOption {
        InventoryCatalogueOption(
            id: warm, key: "warm", label: "Warm", sortOrder: 0, archivedAt: archivedAt)
    }

    static let baseFields = [
        field(lumens, key: "lumens", kind: .measurement, sortOrder: 0),
        field(colour, key: "colour", kind: .enumeration, sortOrder: 1, options: [option()]),
    ]

    /// A second type revision 2 adds: its id and its fields.
    typealias ExtraType = (id: String, fields: [InventoryCatalogueField])

    static func catalogue(
        _ revision: Int, _ fields: [InventoryCatalogueField], extraType: ExtraType? = nil
    ) -> InventoryCatalogueSnapshot {
        let extra = extraType.map {
            InventoryCatalogueType(
                id: $0.id, key: "router", label: "Router", sortOrder: 1, fields: $0.fields)
        }
        return InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "bulb", label: "Bulb", sortOrder: 0, fields: fields)
            ] + [extra].compactMap(\.self))
    }

    /// `field`, declared by the type `owner` instead of the bulb.
    static func field(_ field: InventoryCatalogueField, of owner: String, id: String)
        -> InventoryCatalogueField
    {
        InventoryCatalogueField(
            id: id, typeId: owner, key: field.key, label: field.label,
            sortOrder: field.sortOrder, kind: field.kind, cardinality: field.cardinality,
            required: field.required, storage: field.storage, fixedUnit: field.fixedUnit,
            archivedAt: field.archivedAt,
            enumOptions: field.enumOptions)
    }

    /// A replica holding the lamp at revision 1 (with `base`) and `next` as
    /// revision 2.
    static func replica(
        next: [InventoryCatalogueField], base: [InventoryCatalogueField] = baseFields,
        extraType: ExtraType? = nil
    ) throws -> InventoryReplica {
        let replica = try InventoryReplica()
        let lamp = InventoryItem(
            id: lampId, revision: 1, seq: 1, catalogueRevision: 1, name: "Lamp", typeId: typeId,
            typeKey: "bulb", placement: .hand, createdAt: Fixture.created,
            updatedAt: Fixture.created)
        try replica.apply(
            InventorySnapshotPage(
                epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "c1", total: 1,
                items: [lamp], locations: [], nextCursor: nil, catalogueRevision: 1),
            catalogue: catalogue(1, base))
        try replica.store(catalogue(2, next, extraType: extraType))
        return replica
    }

    static func entry(_ command: InventoryCommand) -> LogEntry {
        LogEntry(
            localSeq: 1, mutationId: "m1", entity: EntityRef(kind: "item", id: lampId),
            command: .command(command), dependsOn: [], baseRevision: 1, catalogueRevision: 1,
            state: .queued, outcome: nil, settlesAtSeq: nil, touched: [], change: nil,
            attempts: 0, createdAt: 0, lastAttemptAt: nil)
    }

    static func edit(_ fieldId: String, _ value: InventoryPrimitiveValue)
        -> InventoryCommand
    {
        .editProtocol2Item(
            id: lampId, catalogueRevision: 1,
            values: [InventoryProtocol2FieldPatch(fieldId: fieldId, values: [value])])
    }

    static func verdict(
        _ command: InventoryCommand, next: [InventoryCatalogueField],
        known: [InventoryCatalogueChange] = [], base: [InventoryCatalogueField] = baseFields,
        extraType: ExtraType? = nil
    ) throws -> CatalogueRebase.Verdict {
        let replica = try replica(next: next, base: base, extraType: extraType)
        return try replica.database.read { db in
            try CatalogueRebase.rebase(entry(command), onto: 2, known: known, in: db)
        }
    }

    /// A change about `id` in revision 2, as the rebase names it.
    static func change(
        _ definition: InventoryCatalogueDefinition, _ id: String,
        _ kind: InventoryCatalogueChangeKind, fieldId: String? = nil,
        replacementId: String? = nil
    ) -> InventoryCatalogueChange {
        InventoryCatalogueChange(
            definition: definition, id: id, typeId: typeId,
            fieldId: fieldId ?? (definition == .field ? id : nil), change: kind,
            replacementId: replacementId, revision: 2)
    }

    static func measurement() throws -> InventoryPrimitiveValue {
        .measurement(amount: try InventoryDecimal("900"), unit: "lm")
    }
}
