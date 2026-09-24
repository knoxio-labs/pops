import AppCore
import GRDB

/// Keeps each item's computed values true to what the phone shows (Inventory
/// ADR-002 D11): the replica evaluates the same expressions as the server,
/// over its optimistic rows, wherever the server's evaluation no longer
/// matches them.
///
/// The server stays authoritative. A server value that still describes the
/// item as the phone shows it is kept and any local one dropped, so a feed
/// page that catches up replaces this phone's guesses. A local value is
/// written only after a local change (an edit, an override set or cleared, an
/// item created offline), a newer revision of something it read, or a newer
/// active catalogue than the one the server evaluated against. Where the
/// phone cannot evaluate (syntax this build does not know, or a reference to
/// an item the replica has not finished downloading) nothing local is written
/// and the field keeps reading "Out of date".
internal enum LocalComputedValues {
    /// Re-evaluates `itemIds` and, transitively, every item whose evaluation
    /// read one of them, then re-indexes every one of them for search, since
    /// what a computed field shows is part of what its item is found by.
    /// Runs in the caller's transaction.
    static func refresh(_ itemIds: Set<String>, in db: Database) throws {
        guard !itemIds.isEmpty else { return }
        let meta = try SyncMeta.read(db)
        guard let revision = meta.catalogueRevision,
            let catalogue = try Protocol2CatalogueRows.read(revision: revision, in: db)
        else { return }
        let context = ReplicaExpressionContext(
            db: db, catalogue: catalogue, complete: meta.since != nil)
        var pending = Array(itemIds)
        var seen: Set<String> = []
        while let itemId = pending.popLast() {
            guard seen.insert(itemId).inserted else { continue }
            try refresh(itemId, context: context)
            pending.append(
                contentsOf: try ComputedValueRows.dependents(of: itemId, in: db).subtracting(seen))
        }
        try ReplicaSearchIndex.reindex(seen, catalogue: SearchCatalogue(catalogue), in: db)
    }

    /// Re-evaluates every item the active catalogue may evaluate differently:
    /// each item holding an evaluation, and each item of a type defining a
    /// computed field. Runs after the active catalogue revision moves, since a
    /// server evaluation against an older one no longer counts as current.
    static func refreshForCatalogueChange(in db: Database) throws {
        guard let revision = try SyncMeta.read(db).catalogueRevision,
            let catalogue = try Protocol2CatalogueRows.read(revision: revision, in: db)
        else { return }
        var itemIds = Set(
            try String.fetchAll(
                db,
                sql: """
                    SELECT item_id FROM \(ComputedValueRows.tableName)
                    UNION SELECT item_id FROM \(ComputedValueRows.localTableName)
                    """))
        for type in catalogue.types where type.fields.contains(where: { $0.storage == .computed }) {
            itemIds.formUnion(
                try String.fetchAll(
                    db,
                    sql: """
                        SELECT id FROM item
                        WHERE type_id = ? OR (type_id IS NULL AND type_key = ?)
                        """,
                    arguments: [type.id, type.key]))
        }
        try refresh(itemIds, in: db)
    }

    private static func refresh(_ itemId: String, context: ReplicaExpressionContext) throws {
        let db = context.db
        guard let item = try context.item(itemId), let type = context.type(of: item) else {
            try ComputedValueRows.deleteLocal(itemId: itemId, in: db)
            return
        }
        let server = try ComputedValueRows.readServer(itemId: itemId, in: db)
        let computed = type.fields.filter { $0.storage == .computed }
        let retired = Set(try ComputedValueRows.read(itemId: itemId, in: db).map(\.fieldId))
            .subtracting(computed.map(\.id))
        try ComputedValueRows.deleteLocal(itemId: itemId, fieldIds: retired, in: db)
        for field in computed {
            let current = server.first { $0.fieldId == field.id }
            if let current, try isCurrent(current, for: item, context: context) {
                try ComputedValueRows.deleteLocal(itemId: itemId, fieldIds: [field.id], in: db)
                continue
            }
            guard let local = context.evaluate(field, of: item), isLocallyKnown(local) else {
                try ComputedValueRows.deleteLocal(itemId: itemId, fieldIds: [field.id], in: db)
                continue
            }
            try ComputedValueRows.writeLocal(itemId: itemId, local, in: db)
        }
    }

    /// Whether the server's evaluation still describes the item as shown.
    private static func isCurrent(
        _ value: InventoryComputedValue, for item: InventoryItem, context: ReplicaExpressionContext
    ) throws -> Bool {
        var revisions: [String: Int?] = [:]
        for dependency in value.dependencies where dependency.itemId != item.id {
            revisions[dependency.itemId] = try context.item(dependency.itemId)?.revision
        }
        return value.display(
            in: item, activeCatalogueRevision: context.catalogue.revision.revision
        ) { revisions[$0].flatMap { $0 } } != .outOfDate
    }

    /// An evaluation that stopped at an item the replica has not downloaded
    /// yet says nothing about the item; the server's answer is still wanted.
    private static func isLocallyKnown(_ value: InventoryComputedValue) -> Bool {
        value.knownUnavailableReason != .referenceUnresolved
    }
}
