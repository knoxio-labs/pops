import AppCore
import GRDB

extension InventoryCatalogueSnapshot {
    /// This revision with the field defaults `other`, the same revision
    /// fetched again, carries wherever this one has none: what a revision
    /// stored by an app that predates defaults becomes.
    func withDefaults(from other: InventoryCatalogueSnapshot) -> InventoryCatalogueSnapshot {
        let fieldPairs = other.types.flatMap(\.fields).map { ($0.id, $0) }
        let fields = Dictionary(fieldPairs) { first, _ in first }
        return InventoryCatalogueSnapshot(
            revision: revision,
            types: types.map { type in
                InventoryCatalogueType(
                    id: type.id, key: type.key, label: type.label, description: type.description,
                    sortOrder: type.sortOrder,
                    fields: type.fields.map { field in
                        let incoming = fields[field.id]?.defaultValues ?? []
                        return field.backfilled(
                            replacedBy: field.replacedBy,
                            defaultValues: field.defaultValues.isEmpty
                                ? incoming : field.defaultValues)
                    },
                    capabilities: type.capabilities, legacyLabels: type.legacyLabels,
                    presentation: type.presentation, archivedAt: type.archivedAt,
                    replacedBy: type.replacedBy)
            })
    }
}

internal enum CatalogueFieldDefaultRows {
    static func encode(_ values: [InventoryPrimitiveValue]) throws -> String {
        try StoredJSON.encode(values.map(Protocol2FieldValueRows.encode))
    }

    static func decode(_ text: String, kind: InventoryPrimitiveKind) throws
        -> [InventoryPrimitiveValue]
    {
        try StoredJSON.decode([String].self, from: text).map {
            try Protocol2FieldValueRows.decode(kind: kind, text: $0)
        }
    }

    /// Records on `stored`'s rows the defaults `incoming`, the same revision
    /// fetched again, carries where `stored` has none.
    static func fill(
        _ stored: InventoryCatalogueSnapshot, from incoming: InventoryCatalogueSnapshot,
        in db: Database
    ) throws {
        let fieldPairs = stored.types.flatMap(\.fields).map { ($0.id, $0) }
        let storedFields = Dictionary(fieldPairs) { first, _ in first }
        for field in incoming.types.flatMap(\.fields)
        where !field.defaultValues.isEmpty
            && storedFields[field.id]?.defaultValues.isEmpty == true
        {
            try db.execute(
                sql: """
                    UPDATE catalogue_field SET default_values = ?
                    WHERE revision = ? AND id = ?
                    """,
                arguments: [
                    try encode(field.defaultValues), stored.revision.revision, field.id,
                ])
        }
    }
}
