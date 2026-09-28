import AppCore
import Foundation
import Testing

@testable import InventoryReplica

internal enum InheritedTypeFixture {
    static let revision = 7
    static let bedding = "50000000-0000-4000-8000-000000000001"
    static let sheet = "50000000-0000-4000-8000-000000000002"
    static let quiltCover = "50000000-0000-4000-8000-000000000003"
    static let unrelated = "50000000-0000-4000-8000-000000000004"
    static let size = "50000000-0000-4000-8000-000000000011"
    static let computed = "50000000-0000-4000-8000-000000000012"
    static let fitted = "50000000-0000-4000-8000-000000000013"
    static let closure = "50000000-0000-4000-8000-000000000014"
    static let reference = "50000000-0000-4000-8000-000000000015"
    static let sizeOption = "50000000-0000-4000-8000-000000000021"
    static let sheetItem = "50000000-0000-4000-8000-000000000101"
    static let targetItem = "50000000-0000-4000-8000-000000000102"

    static func storedField(
        _ id: String, typeId: String, key: String, kind: InventoryPrimitiveKind,
        required: Bool = false, options: [InventoryCatalogueOption] = []
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: key, sortOrder: 0, kind: kind,
            cardinality: .one, required: required, storage: .stored, enumOptions: options)
    }

    static func computedField() -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: computed, typeId: bedding, key: "computed", label: "Computed", sortOrder: 1,
            kind: .boolean, cardinality: .one, required: false, storage: .computed,
            expressionVersion: 1,
            expression: .object(["op": .string("literal"), "value": .boolean(true)]),
            allowOverride: true)
    }

    static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
        types: [
            InventoryCatalogueType(
                id: bedding, key: "bedding", label: "Bedding", sortOrder: 0,
                fields: [
                    storedField(
                        size, typeId: bedding, key: "size", kind: .enumeration, required: true,
                        options: [
                            InventoryCatalogueOption(
                                id: sizeOption, key: "standard", label: "Standard", sortOrder: 0)
                        ]),
                    computedField(),
                ], capabilities: ["containment"]),
            InventoryCatalogueType(
                id: sheet, key: "sheet", label: "Sheet", sortOrder: 1,
                fields: [storedField(fitted, typeId: sheet, key: "fitted", kind: .boolean)],
                parentTypeId: bedding),
            InventoryCatalogueType(
                id: quiltCover, key: "quilt_cover", label: "Quilt cover", sortOrder: 2,
                fields: [storedField(closure, typeId: quiltCover, key: "closure", kind: .boolean)],
                parentTypeId: bedding),
            InventoryCatalogueType(
                id: unrelated, key: "unrelated", label: "Unrelated", sortOrder: 3,
                fields: [
                    InventoryCatalogueField(
                        id: reference, typeId: unrelated, key: "bedding", label: "Bedding",
                        sortOrder: 0, kind: .reference, cardinality: .one, required: false,
                        storage: .stored,
                        references: InventoryReferenceConstraint(
                            targetKinds: [.item], targetTypeIds: [bedding]))
                ]),
        ])

    static func replica() throws -> InventoryReplica {
        let replica = try InventoryReplica(now: { Fixture.created })
        try replica.store(catalogue)
        return replica
    }

    static func item(
        _ id: String = sheetItem, typeId: String = sheet,
        values: [InventoryItemFieldEntry] = []
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, catalogueRevision: revision, name: "Sheet",
            typeId: typeId, typeKey: nil, fieldValues: values, placement: .hand,
            createdAt: Fixture.created, updatedAt: Fixture.created)
    }

    static func downloaded(_ items: [InventoryItem]) throws -> InventoryReplica {
        let replica = try replica()
        try replica.apply(
            InventorySnapshotPage(
                epoch: "inherited-types", highWaterSeq: 1, catalogueVersion: "inherited-types",
                total: items.count, items: items, locations: [], nextCursor: nil,
                catalogueRevision: revision))
        return replica
    }

    static func sizeValue() -> InventoryPrimitiveValue {
        .enumeration(optionId: sizeOption)
    }

    static func create(
        id: String = "50000000-0000-4000-8000-000000000201",
        values: [InventoryProtocol2FieldValue] = []
    ) -> InventoryCommand {
        .createProtocol2Item(
            InventoryNewProtocol2Item(
                id: id, name: "Sheet", catalogueRevision: revision, typeId: sheet,
                values: values, placement: .hand))
    }

    static func rejection(_ body: () throws -> Void) -> InventoryRejectedReason? {
        do {
            try body()
            return nil
        } catch InventoryCommandError.rejected(let reason, _) {
            return reason
        } catch {
            return nil
        }
    }
}

@Suite("Local reducer: inherited protocol-2 fields")
internal struct InheritedFieldReducerTests {
    @Test("an offline sheet create requires inherited Size and gains containment")
    func createUsesInheritedRequiredFieldAndCapability() throws {
        let replica = try InheritedTypeFixture.replica()

        let missing = InheritedTypeFixture.rejection {
            _ = try replica.performLocally(
                InheritedTypeFixture.create(), mutationId: "missing",
                clientTime: Fixture.created)
        }
        #expect(missing == .invalid)

        let created = try replica.performLocally(
            InheritedTypeFixture.create(
                values: [
                    InventoryProtocol2FieldValue(
                        fieldId: InheritedTypeFixture.size,
                        values: [InheritedTypeFixture.sizeValue()])
                ]),
            mutationId: "create", clientTime: Fixture.created)

        #expect(created.events.count == 1)
        let item = try #require(try replica.read(.item(id: "50000000-0000-4000-8000-000000000201")))
        #expect(item.isContainer)
        #expect(item.fieldValues.map(\.fieldId) == [InheritedTypeFixture.size])
    }

    @Test("clearing an inherited required field is refused")
    func clearingInheritedRequiredFieldIsRefused() throws {
        let replica = try InheritedTypeFixture.replica()
        _ = try replica.performLocally(
            InheritedTypeFixture.create(
                values: [
                    InventoryProtocol2FieldValue(
                        fieldId: InheritedTypeFixture.size,
                        values: [InheritedTypeFixture.sizeValue()])
                ]),
            mutationId: "create", clientTime: Fixture.created)

        let reason = InheritedTypeFixture.rejection {
            _ = try replica.performLocally(
                .editProtocol2Item(
                    id: "50000000-0000-4000-8000-000000000201",
                    catalogueRevision: InheritedTypeFixture.revision,
                    values: [
                        InventoryProtocol2FieldPatch(
                            fieldId: InheritedTypeFixture.size, values: nil)
                    ]),
                mutationId: "clear", clientTime: Fixture.created)
        }

        #expect(reason == .invalid)
        #expect(
            try replica.read(.item(id: "50000000-0000-4000-8000-000000000201"))?.fieldValues
                .map(\.fieldId) == [InheritedTypeFixture.size])
    }

    @Test("a sheet changed to quilt cover keeps Size and rejects Fitted")
    func changingTypeUsesBothEffectiveFieldSets() throws {
        let replica = try InheritedTypeFixture.replica()
        _ = try replica.performLocally(
            InheritedTypeFixture.create(
                values: [
                    InventoryProtocol2FieldValue(
                        fieldId: InheritedTypeFixture.size,
                        values: [InheritedTypeFixture.sizeValue()]),
                    InventoryProtocol2FieldValue(
                        fieldId: InheritedTypeFixture.fitted, values: [.boolean(true)]),
                ]),
            mutationId: "create", clientTime: Fixture.created)

        _ = try replica.performLocally(
            .changeProtocol2ItemType(
                id: "50000000-0000-4000-8000-000000000201",
                catalogueRevision: InheritedTypeFixture.revision,
                typeId: InheritedTypeFixture.quiltCover,
                values: [
                    InventoryProtocol2FieldValue(
                        fieldId: InheritedTypeFixture.size,
                        values: [InheritedTypeFixture.sizeValue()])
                ]),
            mutationId: "change", clientTime: Fixture.created)

        let item = try #require(
            try replica.read(.item(id: "50000000-0000-4000-8000-000000000201")))
        #expect(item.typeId == InheritedTypeFixture.quiltCover)
        #expect(item.fieldValues.map(\.fieldId) == [InheritedTypeFixture.size])

        let reason = InheritedTypeFixture.rejection {
            _ = try replica.performLocally(
                .editProtocol2Item(
                    id: item.id, catalogueRevision: InheritedTypeFixture.revision,
                    values: [
                        InventoryProtocol2FieldPatch(
                            fieldId: InheritedTypeFixture.fitted, values: [.boolean(true)])
                    ]),
                mutationId: "fitted", clientTime: Fixture.created)
        }
        #expect(reason == .invalid)
    }
}
