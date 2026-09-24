import AppCore
import Foundation

@testable import FeatureInventory

/// A cable type at catalogue revision 2 with one of everything a queued
/// change can be left behind by, and the repairs the design stages on it.
internal enum CatalogueRepairFixture {
    static let revision = 2
    static let typeId = "type-cable"
    static let cableId = "cable"
    static let archived = "2026-09-20T00:00:00.000Z"

    static let shielding = field("f-shielding", "Shielding", archivedAt: archived)
    static let length = field("f-length", "Length")
    static let screen = field("f-screen", "Screen size", archivedAt: archived)
    static let diagonal = field("f-diagonal", "Diagonal")
    static let capacity = field("f-capacity", "Capacity", required: true)
    static let sage = InventoryCatalogueOption(
        id: "o-sage", key: "sage", label: "Sage", sortOrder: 0, archivedAt: archived)
    static let white = InventoryCatalogueOption(
        id: "o-white", key: "white", label: "White", sortOrder: 1)
    static let colour = InventoryCatalogueField(
        id: "f-colour", typeId: typeId, key: "colour", label: "Colour", sortOrder: 5,
        kind: .enumeration, cardinality: .one, required: false, storage: .stored,
        enumOptions: [sage, white])

    static func field(
        _ id: String, _ label: String, required: Bool = false, archivedAt: String? = nil
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: label.lowercased(), label: label, sortOrder: 0,
            kind: .shortText, cardinality: .one, required: required, storage: .stored,
            archivedAt: archivedAt)
    }

    static func catalogue(
        revision: Int = revision, extra: [InventoryCatalogueField] = []
    ) -> InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "cable", label: "Cable", sortOrder: 0,
                    fields: [shielding, length, screen, diagonal, capacity, colour] + extra)
            ])
    }

    /// The cable as the server has it, with the required Capacity set.
    static let cable = InventoryItem(
        id: cableId, revision: 1, seq: 1, catalogueRevision: revision,
        name: "USB-A to USB-C cable", typeId: typeId, typeKey: nil,
        fieldValues: [
            InventoryItemFieldEntry(
                fieldId: capacity.id, state: .value([.string("1 l")]), source: .stored,
                catalogueRevision: revision)
        ], placement: .hand, createdAt: InventoryFixture.epoch,
        updatedAt: InventoryFixture.epoch)

    static func edit(_ values: [(InventoryCatalogueField, InventoryPrimitiveValue)])
        -> InventoryCommand
    {
        .editProtocol2Item(
            id: cableId, catalogueRevision: 1,
            values: values.map { .init(fieldId: $0.0.id, values: [$0.1]) })
    }

    static func change(
        _ definition: InventoryCatalogueDefinition, _ id: String,
        _ kind: InventoryCatalogueChangeKind, fieldId: String? = nil,
        replacementId: String? = nil
    ) -> InventoryCatalogueChange {
        InventoryCatalogueChange(
            definition: definition, id: id, typeId: typeId, fieldId: fieldId, change: kind,
            replacementId: replacementId, revision: revision)
    }

    static func repair(
        _ id: String = "m1", queued: InventoryCommand?, changes: [InventoryCatalogueChange],
        openedAt: Int = revision, current: Int = revision
    ) -> InventoryRepair {
        InventoryRepair(
            id: id, entityKind: .item, entityId: cableId, kind: .catalogueChanged,
            catalogue: InventoryCatalogueRepair(
                queued: queued, changes: changes, openedAtRevision: openedAt,
                currentRevision: current),
            openedAt: InventoryFixture.epoch)
    }

    /// Shielding archived under a queued edit that also set Length.
    static let shieldingArchived = repair(
        queued: edit([(shielding, .string("Braided")), (length, .string("2 m"))]),
        changes: [change(.field, shielding.id, .archived, fieldId: shielding.id)])

    static func reading(_ catalogue: InventoryCatalogueSnapshot? = catalogue())
        -> InventoryCatalogueRepairReading
    {
        InventoryCatalogueRepairReading(catalogue: catalogue) { _ in nil }
    }

    /// A store holding the cable, `repairs` and `waiting`, over the fixture
    /// catalogue.
    static func store(
        repairs: [InventoryRepair] = [shieldingArchived], waiting: [InventoryQueuedMutation] = [],
        catalogue: InventoryCatalogueSnapshot = catalogue()
    ) -> RecordingFormStore {
        RecordingFormStore(
            FormFixtureSource(
                items: [cable], protocol2Catalogue: catalogue,
                ledger: InventoryReplicaSyncLedger(waiting: waiting, repairs: repairs)))
    }
}
