import AppCore

extension InventoryCatalogueSnapshot {
    /// This revision in the order ``Protocol2CatalogueRows/read(revision:in:)``
    /// gives it back: types, fields and options by sort order, then key, as
    /// SQLite's binary collation compares them. The server's own order is not
    /// part of the contract, so a revision fetched again compares equal to the
    /// stored one however it arrived.
    var inStoredOrder: InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: revision,
            types: types.sorted { storedOrder(($0.sortOrder, $0.key), ($1.sortOrder, $1.key)) }
                .map(\.inStoredOrder))
    }
}

extension InventoryCatalogueType {
    var inStoredOrder: InventoryCatalogueType {
        InventoryCatalogueType(
            id: id, key: key, label: label, description: description, sortOrder: sortOrder,
            fields: fields.sorted { storedOrder(($0.sortOrder, $0.key), ($1.sortOrder, $1.key)) }
                .map(\.inStoredOrder),
            capabilities: capabilities, legacyLabels: legacyLabels, presentation: presentation,
            archivedAt: archivedAt, replacedBy: replacedBy, parentTypeId: parentTypeId)
    }
}

extension InventoryCatalogueField {
    var inStoredOrder: InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: label, help: help, sortOrder: sortOrder,
            kind: kind, cardinality: cardinality, required: required, storage: storage,
            fixedUnit: fixedUnit, references: references, expressionVersion: expressionVersion,
            expression: expression, allowOverride: allowOverride, defaultValues: defaultValues,
            presentation: presentation, archivedAt: archivedAt, replacedBy: replacedBy,
            enumOptions: enumOptions.sorted {
                storedOrder(($0.sortOrder, $0.key), ($1.sortOrder, $1.key))
            })
    }
}

private func storedOrder(_ lhs: (Int, String), _ rhs: (Int, String)) -> Bool {
    lhs.0 != rhs.0 ? lhs.0 < rhs.0 : lhs.1.utf8.lexicographicallyPrecedes(rhs.1.utf8)
}
