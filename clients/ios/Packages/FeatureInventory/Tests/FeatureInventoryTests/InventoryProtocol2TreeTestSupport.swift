import AppCore

internal enum InventoryProtocol2TreeFixture {
    static let beddingTypeId = "bedding"
    static let sheetTypeId = "sheet"
    static let quiltCoverTypeId = "quilt-cover"

    static let size = field(
        id: "size", typeId: beddingTypeId, key: "size", label: "Size", required: true)
    static let fitted = field(
        id: "fitted", typeId: sheetTypeId, key: "fitted", label: "Fitted")
    static let closure = field(
        id: "closure", typeId: quiltCoverTypeId, key: "closure", label: "Closure")

    static func catalogue() -> InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 7, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: beddingTypeId, key: "bedding", label: "Bedding", sortOrder: 0,
                    fields: [size]),
                InventoryCatalogueType(
                    id: sheetTypeId, key: "sheet", label: "Sheet", sortOrder: 1,
                    fields: [fitted], parentTypeId: beddingTypeId),
                InventoryCatalogueType(
                    id: quiltCoverTypeId, key: "quilt_cover", label: "Quilt cover", sortOrder: 2,
                    fields: [closure], parentTypeId: beddingTypeId),
            ])
    }

    private static func field(
        id: String, typeId: String, key: String, label: String, required: Bool = false
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: label, sortOrder: 0,
            kind: .shortText, cardinality: .one, required: required, storage: .stored)
    }
}
