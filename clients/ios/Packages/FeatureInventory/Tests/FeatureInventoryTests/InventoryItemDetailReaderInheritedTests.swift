import AppCore
import Testing

@testable import FeatureInventory

extension InventoryItemDetailReaderTests {
    @Test("a sheet item shows a value from its inherited Size field")
    func inheritedProtocol2Value() throws {
        let size = InventoryCatalogueField(
            id: "size", typeId: "bedding", key: "size", label: "Size", sortOrder: 0,
            kind: .shortText, cardinality: .one, required: false, storage: .stored)
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: "bedding", key: "bedding", label: "Bedding", sortOrder: 0,
                    fields: [size]),
                InventoryCatalogueType(
                    id: "sheet", key: "sheet", label: "Sheet", sortOrder: 1,
                    parentTypeId: "bedding"),
            ])
        let item = InventoryItem(
            id: "sheet-item", revision: 1, seq: 1, catalogueRevision: 1, name: "Sheet",
            typeId: "sheet", typeKey: nil,
            fieldValues: [
                InventoryItemFieldEntry(
                    fieldId: size.id, state: .value([.string("Queen")]), source: .stored,
                    catalogueRevision: 1)
            ], placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let source = FormFixtureSource(items: [item], protocol2Catalogue: catalogue)

        let detail = try #require(
            InventoryItemDetail(reading: source, id: item.id, now: FormFixture.epoch))

        #expect(detail.otherFields.map(\.label) == ["Size"])
        #expect(detail.otherFields.map(\.value) == ["Queen"])
        #expect(detail.record.typeName == "Sheet")
    }
}
