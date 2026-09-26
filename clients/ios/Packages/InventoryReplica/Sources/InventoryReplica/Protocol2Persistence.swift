import AppCore
import GRDB

internal enum Protocol2CatalogueRows {
    /// Stores `catalogue` unless its revision is already stored, and says
    /// whether it inserted it.
    @discardableResult
    static func store(_ catalogue: InventoryCatalogueSnapshot, in db: Database) throws -> Bool {
        if let stored = try read(revision: catalogue.revision.revision, in: db) {
            let incoming = catalogue.inStoredOrder
            if stored == incoming { return false }
            guard stored.withLineage(from: incoming).withDefaults(from: incoming) == incoming
            else {
                throw InventoryReplicaError.corruptValue(
                    "catalogue revision \(catalogue.revision.revision) changed")
            }
            try CatalogueLineageRows.fill(stored, from: incoming, in: db)
            try CatalogueFieldDefaultRows.fill(stored, from: incoming, in: db)
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
                     legacy_labels, presentation, archived_at, replaced_by, parent_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                revision, type.id, type.key, type.label, type.description, type.sortOrder,
                try StoredJSON.encode(type.capabilities), try StoredJSON.encode(type.legacyLabels),
                try StoredJSON.encode(type.presentation), type.archivedAt, type.replacedBy,
                type.parentTypeId,
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
                     expression_version, expression, allow_override, default_values,
                     presentation, archived_at, replaced_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                revision, field.id, field.typeId, field.key, field.label, field.help,
                field.sortOrder, field.kind.rawValue, field.cardinality.rawValue,
                field.required, field.storage.rawValue, field.fixedUnit,
                try StoredJSON.encode(field.references.targetKinds.map(\.rawValue).sorted()),
                try StoredJSON.encode(field.references.targetTypeIds.sorted()),
                field.expressionVersion, try field.expression.map(StoredJSON.encode),
                field.allowOverride, try CatalogueFieldDefaultRows.encode(field.defaultValues),
                try StoredJSON.encode(field.presentation), field.archivedAt, field.replacedBy,
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

    /// The revisions among `revisions` this replica holds no catalogue for.
    func unheldCatalogueRevisions(_ revisions: Set<Int>) throws -> Set<Int> {
        guard !revisions.isEmpty else { return [] }
        return try database.read { db in
            revisions.subtracting(
                try Int.fetchAll(db, sql: "SELECT revision FROM catalogue_revision"))
        }
    }

    /// Stores the catalogue a snapshot page pins, every older revision its
    /// items' values still name (`referencedCatalogues`), and the page, in one
    /// transaction. Only the pinned revision becomes the replica's current one.
    /// `resyncing` discards the server's rows first, as ``apply(_:resyncing:)``
    /// does, in that same transaction.
    public func apply(
        _ page: InventorySnapshotPage, catalogue: InventoryCatalogueSnapshot,
        referencedCatalogues: [InventoryCatalogueSnapshot] = [], resyncing: Bool = false
    ) throws {
        guard page.catalogueRevision == catalogue.revision.revision else {
            throw InventoryReplicaError.corruptValue("snapshot catalogue revision does not match")
        }
        try write { db in
            for referenced in referencedCatalogues {
                try Protocol2CatalogueRows.store(referenced, in: db)
            }
            try Protocol2CatalogueRows.storeAndReindex(catalogue, in: db) {
                try ReplicaApply.snapshot(page, now: now(), resyncing: resyncing, in: db)
            }
        }
    }

    /// Stores the catalogue a feed page pins, every older revision its items'
    /// values still name (`referencedCatalogues`), and the page, atomically.
    public func apply(
        _ page: InventoryChangesPage, catalogue: InventoryCatalogueSnapshot,
        referencedCatalogues: [InventoryCatalogueSnapshot] = []
    ) throws {
        guard page.catalogueRevision == catalogue.revision.revision else {
            throw InventoryReplicaError.corruptValue("feed catalogue revision does not match")
        }
        try write { db in
            for referenced in referencedCatalogues {
                try Protocol2CatalogueRows.store(referenced, in: db)
            }
            try Protocol2CatalogueRows.storeAndReindex(catalogue, in: db) {
                try ReplicaApply.changes(page, now: now(), in: db)
            }
        }
    }
}
