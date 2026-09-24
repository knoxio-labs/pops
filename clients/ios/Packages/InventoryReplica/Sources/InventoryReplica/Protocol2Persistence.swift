import AppCore
import GRDB

private struct Protocol2FieldKinds {
    let primitive: InventoryPrimitiveKind
    let cardinality: InventoryFieldCardinality
    let storage: InventoryFieldStorage
}

internal enum Protocol2CatalogueRows {
    /// Stores `catalogue` unless its revision is already stored, and says
    /// whether it inserted it.
    @discardableResult
    static func store(_ catalogue: InventoryCatalogueSnapshot, in db: Database) throws -> Bool {
        if let stored = try read(revision: catalogue.revision.revision, in: db) {
            guard stored == catalogue.inStoredOrder else {
                throw InventoryReplicaError.corruptValue(
                    "catalogue revision \(catalogue.revision.revision) changed")
            }
            return false
        }
        let revision = catalogue.revision
        try db.execute(
            sql: """
                INSERT INTO catalogue_revision
                    (revision, base_revision, status, minimum_protocol)
                VALUES (?, ?, ?, ?)
                """,
            arguments: [
                revision.revision, revision.baseRevision, revision.status.rawValue,
                revision.minimumProtocol,
            ])
        for type in catalogue.types {
            try store(type, revision: revision.revision, in: db)
        }
        return true
    }

    /// Stores `catalogue`, runs `apply`, and re-indexes every item only when
    /// the revision was newly stored or is not the one items were indexed
    /// against. A page under the revision already in use re-indexes just its
    /// own rows (``MutationLogReplay/rebase(resetting:in:)``), so a paginated
    /// sync does not rewrite the whole index once per page.
    static func storeAndReindex(
        _ catalogue: InventoryCatalogueSnapshot, in db: Database, apply: () throws -> Void
    ) throws {
        let indexedRevision = try SyncMeta.read(db).catalogueRevision
        let inserted = try store(catalogue, in: db)
        try apply()
        if inserted || indexedRevision != catalogue.revision.revision {
            try Protocol2SearchIndex.reindex(catalogue, in: db)
        }
    }

    static func read(revision: Int, in db: Database) throws -> InventoryCatalogueSnapshot? {
        guard
            let revisionRow = try Row.fetchOne(
                db, sql: "SELECT * FROM catalogue_revision WHERE revision = ?",
                arguments: [revision])
        else { return nil }
        let status: String = try revisionRow.decode(forColumn: "status")
        guard let revisionStatus = InventoryCatalogueRevisionStatus(rawValue: status) else {
            throw InventoryReplicaError.corruptValue("catalogue status \(status)")
        }
        let typeRows = try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM catalogue_type WHERE revision = ?
                ORDER BY sort_order, key
                """, arguments: [revision])
        let types = try typeRows.map { try type(from: $0, revision: revision, in: db) }
        return InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(
                revision: revision,
                baseRevision: try revisionRow.decode(forColumn: "base_revision"),
                status: revisionStatus,
                minimumProtocol: try revisionRow.decode(forColumn: "minimum_protocol")),
            types: types)
    }

    private static func store(
        _ type: InventoryCatalogueType, revision: Int, in db: Database
    ) throws {
        try db.execute(
            sql: """
                INSERT INTO catalogue_type
                    (revision, id, key, label, description, sort_order, capabilities,
                     legacy_labels, presentation, archived_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                revision, type.id, type.key, type.label, type.description, type.sortOrder,
                try StoredJSON.encode(type.capabilities), try StoredJSON.encode(type.legacyLabels),
                try StoredJSON.encode(type.presentation), type.archivedAt,
            ])
        for field in type.fields {
            try store(field, revision: revision, in: db)
        }
    }

    private static func store(
        _ field: InventoryCatalogueField, revision: Int, in db: Database
    ) throws {
        try db.execute(
            sql: """
                INSERT INTO catalogue_field
                    (revision, id, type_id, key, label, help, sort_order, kind, cardinality,
                     required, storage, fixed_unit, reference_kinds, reference_type_ids,
                     expression_version, expression, allow_override, presentation, archived_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                revision, field.id, field.typeId, field.key, field.label, field.help,
                field.sortOrder, field.kind.rawValue, field.cardinality.rawValue,
                field.required, field.storage.rawValue, field.fixedUnit,
                try StoredJSON.encode(field.references.targetKinds.map(\.rawValue).sorted()),
                try StoredJSON.encode(field.references.targetTypeIds.sorted()),
                field.expressionVersion, try field.expression.map(StoredJSON.encode),
                field.allowOverride, try StoredJSON.encode(field.presentation), field.archivedAt,
            ])
        for option in field.enumOptions {
            try db.execute(
                sql: """
                    INSERT INTO catalogue_option
                        (revision, id, field_id, key, label, sort_order, archived_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                arguments: [
                    revision, option.id, field.id, option.key, option.label, option.sortOrder,
                    option.archivedAt,
                ])
        }
    }

    private static func type(
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
            archivedAt: try row.decode(forColumn: "archived_at"))
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

extension InventoryReplica {
    /// Stores a complete immutable protocol-2 catalogue revision without replacing older revisions.
    public func store(_ catalogue: InventoryCatalogueSnapshot) throws {
        try write { db in
            try Protocol2CatalogueRows.storeAndReindex(catalogue, in: db) {
                var meta = try SyncMeta.read(db)
                let moved = meta.catalogueRevision != catalogue.revision.revision
                meta.catalogueRevision = catalogue.revision.revision
                try meta.write(db)
                if moved { try LocalComputedValues.refreshForCatalogueChange(in: db) }
            }
        }
    }

    /// Reads one exact immutable protocol-2 catalogue revision from the replica.
    public func catalogue(revision: Int) throws -> InventoryCatalogueSnapshot? {
        try database.read { try Protocol2CatalogueRows.read(revision: revision, in: $0) }
    }

    /// Stores a required catalogue and its first snapshot page in one transaction.
    public func apply(
        _ page: InventorySnapshotPage, catalogue: InventoryCatalogueSnapshot
    ) throws {
        guard page.catalogueRevision == catalogue.revision.revision else {
            throw InventoryReplicaError.corruptValue("snapshot catalogue revision does not match")
        }
        try write { db in
            try Protocol2CatalogueRows.storeAndReindex(catalogue, in: db) {
                try ReplicaApply.snapshot(page, now: now(), in: db)
            }
        }
    }

    /// Stores a newly announced catalogue and the first dependent feed page atomically.
    public func apply(
        _ page: InventoryChangesPage, catalogue: InventoryCatalogueSnapshot
    ) throws {
        guard page.catalogueRevision == catalogue.revision.revision else {
            throw InventoryReplicaError.corruptValue("feed catalogue revision does not match")
        }
        try write { db in
            try Protocol2CatalogueRows.storeAndReindex(catalogue, in: db) {
                try ReplicaApply.changes(page, now: now(), in: db)
            }
        }
    }
}
