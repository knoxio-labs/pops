import AppCore
import Testing

@testable import FeatureInventory

@Suite("Protocol 2 item detail")
internal struct InventoryProtocol2ItemDetailTests {
    private struct DynamicFixture {
        let type: InventoryCatalogueType
        let item: InventoryItem
        let target: InventoryItem
    }

    @Test("detail resolves references, retired enums, and unavailable values")
    func dynamicDetailPresentation() throws {
        let fixture = Self.dynamicFixture()
        let source = FormFixtureSource(
            items: [fixture.item, fixture.target],
            protocol2Catalogue: InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2),
                types: [fixture.type]))

        let detail = try #require(
            InventoryItemDetail(reading: source, id: fixture.item.id, now: FormFixture.epoch))

        #expect(detail.record.typeName == "Cable")
        #expect(detail.otherFields.map(\.label) == ["Related", "Connector", "Summary"])
        #expect(
            detail.otherFields.map(\.value) == [
                "Renamed target", "Old connector (Retired)",
                "Unavailable because the referenced record is missing",
            ])
        #expect(detail.otherFields.map(\.source) == [.recorded, .recorded, .unavailable])
    }

    @Test("a deleted reference remains a readable stale identity")
    func deletedReferencePresentation() throws {
        let field = Self.field(
            id: "reference", label: "Related", kind: .reference,
            references: .init(targetKinds: [.item]))
        let type = InventoryCatalogueType(
            id: "type-id", key: "cable", label: "Cable", sortOrder: 0, fields: [field])
        let item = InventoryItem(
            id: "item-1", revision: 1, seq: 1, catalogueRevision: 4, name: "Lead",
            typeId: type.id, typeKey: "cable",
            fieldValues: [
                InventoryItemFieldEntry(
                    fieldId: field.id,
                    state: .value([
                        .reference(
                            InventoryReferenceValue(
                                targetKind: .item, targetId: "target",
                                targetState: .deleted))
                    ]), source: .stored, catalogueRevision: 4)
            ], placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let deleted = InventoryItem(
            id: "target", revision: 2, seq: 2, name: "Old target", typeKey: nil,
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch,
            deletedAt: FormFixture.epoch)
        let source = FormFixtureSource(
            items: [item, deleted],
            protocol2Catalogue: InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2),
                types: [type]))

        let detail = try #require(
            InventoryItemDetail(reading: source, id: item.id, now: FormFixture.epoch))
        #expect(detail.otherFields.first?.value == "Deleted item")
    }

    private static func dynamicFixture() -> DynamicFixture {
        let retired = InventoryCatalogueOption(
            id: "retired", key: "old", label: "Old connector", sortOrder: 0,
            archivedAt: "2026-09-01")
        let referenceField = field(
            id: "reference", label: "Related", kind: .reference,
            references: .init(targetKinds: [.item]))
        let enumField = field(
            id: "enum", label: "Connector", kind: .enumeration, enumOptions: [retired])
        let computedField = field(
            id: "computed", label: "Summary", kind: .shortText, storage: .computed)
        let type = InventoryCatalogueType(
            id: "type-id", key: "cable", label: "Cable", sortOrder: 0,
            fields: [referenceField, enumField, computedField])
        let item = InventoryItem(
            id: "item-1", revision: 1, seq: 1, catalogueRevision: 4, name: "Lead",
            typeId: type.id, typeKey: "cable",
            fieldValues: [
                InventoryItemFieldEntry(
                    fieldId: referenceField.id,
                    state: .value([
                        .reference(
                            InventoryReferenceValue(
                                targetKind: .item, targetId: "target",
                                targetState: .resolved))
                    ]), source: .stored, catalogueRevision: 4),
                InventoryItemFieldEntry(
                    fieldId: enumField.id,
                    state: .value([.enumeration(optionId: retired.id)]), source: .stored,
                    catalogueRevision: 4),
            ],
            computedValues: [missingReference(computed: computedField, reference: referenceField)],
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let target = InventoryItem(
            id: "target", revision: 2, seq: 2, name: "Renamed target", typeKey: nil,
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        return DynamicFixture(type: type, item: item, target: target)
    }

    private static func missingReference(
        computed: InventoryCatalogueField, reference: InventoryCatalogueField
    ) -> InventoryComputedValue {
        InventoryComputedValue(
            fieldId: computed.id, catalogueRevision: 4,
            evaluation: .unavailable(reason: "reference_missing", failedFieldId: reference.id),
            dependencies: [], traversedItemIds: ["item-1", "target"], evaluatedItemRevision: 1)
    }

    private static func field(
        id: String, label: String, kind: InventoryPrimitiveKind,
        storage: InventoryFieldStorage = .stored,
        references: InventoryReferenceConstraint = .init(),
        enumOptions: [InventoryCatalogueOption] = []
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: "type-id", key: id, label: label, sortOrder: 0, kind: kind,
            cardinality: .one, required: false, storage: storage, references: references,
            expressionVersion: storage == .computed ? 1 : nil,
            expression: storage == .computed ? .object([:]) : nil,
            enumOptions: enumOptions)
    }
}

@Suite("Protocol 2 server validation repair")
internal struct InventoryProtocol2RepairTests {
    @Test("a catalogue rejection explains how to repair the queued value")
    func catalogueRejectionIsActionable() throws {
        let repair = InventoryRepair(
            id: "mutation", entityKind: .item, entityId: "item-1",
            kind: .unrecognised("invalid"), openedAt: FormFixture.epoch)
        let source = FormFixtureSource(items: [FormFixture.item("item-1", "Cable")])
        let ledger = InventoryReplicaSyncLedger(repairs: [repair])

        let row = try #require(
            InventorySyncPage.buildRepairRows(ledger, reading: source).first)
        #expect(
            row.problem
                == "This change no longer matches the catalogue. Edit the item, then let this change go."
        )
        #expect(
            InventoryDetailConflicts.conflict(repair).problem
                == "A queued value no longer matches the catalogue")
        #expect(repair.kind.keepTitle == nil)
        #expect(repair.kind.letGoTitle == "Let go")
    }
}
