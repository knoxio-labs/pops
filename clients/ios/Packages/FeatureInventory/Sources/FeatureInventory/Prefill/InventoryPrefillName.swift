import AppCore

internal enum InventoryPrefillName {
    internal static let id = "inventory-item-name"

    internal static func field(typeId: String) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: "Name", label: "Name",
            help: "The item's name, copied from the facts.", sortOrder: Int.min,
            kind: .shortText, cardinality: .one, required: false, storage: .stored)
    }
}
