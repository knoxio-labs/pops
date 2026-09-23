import AppCore

/// The stable-ID portion of an item form. It is deliberately separate from
/// the protocol-1 keyed draft so a cached catalogue revision can never be
/// mixed with legacy keys in one mutation.
internal struct InventoryProtocol2Draft: Hashable, Sendable {
    internal var typeId: String
    internal let catalogueRevision: Int
    internal var values: [String: [InventoryPrimitiveValue]]
    internal var touched: Set<String>

    internal init(typeId: String, catalogueRevision: Int, item: InventoryItem? = nil) {
        self.typeId = typeId
        self.catalogueRevision = catalogueRevision
        values = Dictionary(
            uniqueKeysWithValues: (item?.fieldValues ?? []).compactMap { entry in
                guard case .value(let value) = entry.state, entry.source == .stored else {
                    return nil
                }
                return (entry.fieldId, value)
            })
        touched = []
    }

    internal func values(for field: InventoryCatalogueField) -> [InventoryPrimitiveValue] {
        values[field.id] ?? []
    }

    internal mutating func set(_ values: [InventoryPrimitiveValue], for field: InventoryCatalogueField) {
        if values.isEmpty {
            self.values.removeValue(forKey: field.id)
        } else {
            self.values[field.id] = values
        }
        touched.insert(field.id)
    }

    internal func completeValues(for type: InventoryCatalogueType) -> [InventoryProtocol2FieldValue] {
        type.fields.compactMap { field in
            guard field.storage == .stored, let values = values[field.id], !values.isEmpty else {
                return nil
            }
            return .init(fieldId: field.id, values: values)
        }
    }

    internal func patches(for type: InventoryCatalogueType) -> [InventoryProtocol2FieldPatch] {
        type.fields.compactMap { field in
            guard field.storage == .stored, touched.contains(field.id) else { return nil }
            return .init(fieldId: field.id, values: values[field.id])
        }
    }
}
