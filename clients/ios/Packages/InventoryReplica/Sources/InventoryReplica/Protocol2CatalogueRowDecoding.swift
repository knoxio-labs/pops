import AppCore
import GRDB

private struct Protocol2FieldKinds {
    let primitive: InventoryPrimitiveKind
    let cardinality: InventoryFieldCardinality
    let storage: InventoryFieldStorage
}

extension Protocol2CatalogueRows {
    /// Decodes one stored catalogue type row with its fields and options.
    static func type(
        from row: Row, revision: Int, in db: Database
    ) throws -> InventoryCatalogueType {
        let id: String = try row.decode(forColumn: "id")
        let fieldRows = try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM catalogue_field WHERE revision = ? AND type_id = ?
                ORDER BY sort_order, key
                """, arguments: [revision, id])
        return InventoryCatalogueType(
            id: id, key: try row.decode(forColumn: "key"),
            label: try row.decode(forColumn: "label"),
            description: try row.decode(forColumn: "description"),
            sortOrder: try row.decode(forColumn: "sort_order"),
            fields: try fieldRows.map { try field(from: $0, revision: revision, in: db) },
            capabilities: try StoredJSON.decode(
                [String].self, from: try row.decode(forColumn: "capabilities")),
            legacyLabels: try StoredJSON.decode(
                [String].self, from: try row.decode(forColumn: "legacy_labels")),
            presentation: try StoredJSON.decode(
                InventoryJSON.self, from: try row.decode(forColumn: "presentation")),
            archivedAt: try row.decode(forColumn: "archived_at"),
            replacedBy: try row.decode(forColumn: "replaced_by"))
    }

    private static func field(
        from row: Row, revision: Int, in db: Database
    ) throws -> InventoryCatalogueField {
        let id: String = try row.decode(forColumn: "id")
        let kinds = try fieldKinds(from: row, fieldId: id)
        let targetKinds = try referenceKinds(from: row)
        let optionRows = try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM catalogue_option WHERE revision = ? AND field_id = ?
                ORDER BY sort_order, key
                """, arguments: [revision, id])
        let expression: String? = try row.decode(forColumn: "expression")
        return InventoryCatalogueField(
            id: id, typeId: try row.decode(forColumn: "type_id"),
            key: try row.decode(forColumn: "key"), label: try row.decode(forColumn: "label"),
            help: try row.decode(forColumn: "help"),
            sortOrder: try row.decode(forColumn: "sort_order"), kind: kinds.primitive,
            cardinality: kinds.cardinality, required: try row.decode(forColumn: "required"),
            storage: kinds.storage, fixedUnit: try row.decode(forColumn: "fixed_unit"),
            references: InventoryReferenceConstraint(
                targetKinds: targetKinds,
                targetTypeIds: Set(
                    try StoredJSON.decode(
                        [String].self, from: try row.decode(forColumn: "reference_type_ids")))),
            expressionVersion: try row.decode(forColumn: "expression_version"),
            expression: try expression.map {
                try StoredJSON.decode(InventoryJSON.self, from: $0)
            }, allowOverride: try row.decode(forColumn: "allow_override"),
            presentation: try StoredJSON.decode(
                InventoryJSON.self, from: try row.decode(forColumn: "presentation")),
            archivedAt: try row.decode(forColumn: "archived_at"),
            replacedBy: try row.decode(forColumn: "replaced_by"),
            enumOptions: try optionRows.map {
                InventoryCatalogueOption(
                    id: try $0.decode(forColumn: "id"), key: try $0.decode(forColumn: "key"),
                    label: try $0.decode(forColumn: "label"),
                    sortOrder: try $0.decode(forColumn: "sort_order"),
                    archivedAt: try $0.decode(forColumn: "archived_at"))
            })
    }

    private static func fieldKinds(
        from row: Row, fieldId: String
    ) throws -> Protocol2FieldKinds {
        let primitive: String = try row.decode(forColumn: "kind")
        let cardinality: String = try row.decode(forColumn: "cardinality")
        let storage: String = try row.decode(forColumn: "storage")
        guard let primitive = InventoryPrimitiveKind(rawValue: primitive),
            let cardinality = InventoryFieldCardinality(rawValue: cardinality),
            let storage = InventoryFieldStorage(rawValue: storage)
        else { throw InventoryReplicaError.corruptValue("catalogue field \(fieldId)") }
        return Protocol2FieldKinds(
            primitive: primitive, cardinality: cardinality, storage: storage)
    }

    private static func referenceKinds(from row: Row) throws -> Set<InventoryReferenceTargetKind> {
        let values = try StoredJSON.decode(
            [String].self, from: try row.decode(forColumn: "reference_kinds"))
        return try Set(
            values.map { value in
                guard let kind = InventoryReferenceTargetKind(rawValue: value) else {
                    throw InventoryReplicaError.corruptValue("reference kind \(value)")
                }
                return kind
            })
    }
}
