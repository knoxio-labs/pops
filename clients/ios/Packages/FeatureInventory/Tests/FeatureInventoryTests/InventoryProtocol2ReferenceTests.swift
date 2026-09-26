import AppCore
import Testing

@testable import FeatureInventory

@Suite("Protocol 2 reference constraints")
internal struct InventoryProtocol2ReferenceTests {
    @Test("a reference field accepts an item whose type descends from its constraint")
    func referenceConstraintsIncludeDescendants() {
        let field = InventoryCatalogueField(
            id: "reference", typeId: "item", key: "reference", label: "Reference", sortOrder: 0,
            kind: .reference, cardinality: .one, required: false, storage: .stored,
            references: .init(targetKinds: [.item], targetTypeIds: ["bedding"]))
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: "bedding", key: "bedding", label: "Bedding", sortOrder: 0),
                InventoryCatalogueType(
                    id: "sheet", key: "sheet", label: "Sheet", sortOrder: 1,
                    parentTypeId: "bedding"),
            ])
        let targets = [
            InventoryProtocol2ReferenceTarget(
                kind: .item, id: "sheet-1", label: "Sheet", typeId: "sheet"),
            InventoryProtocol2ReferenceTarget(
                kind: .item, id: "tool-1", label: "Tool", typeId: "tool"),
        ]

        let allowed = InventoryProtocol2ReferenceTargets.allowed(
            for: field, among: targets, catalogue: catalogue)
        #expect(allowed.map(\.id) == ["sheet-1"])
    }
}
