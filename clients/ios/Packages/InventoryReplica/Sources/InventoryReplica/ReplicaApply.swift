import AppCore
import Foundation
import GRDB

/// Writes a snapshot or change-feed page into the replica, one transaction
/// per page (the caller's `write`).
///
/// Rows are upserted by revision (ADR-002 D9): a row whose revision is not
/// above the stored one is ignored, which is what makes a snapshot page that
/// raced a feed page, or a page delivered twice, harmless. A tombstone is an
/// ordinary newer revision carrying `deletedAt`; the row stays so a remembered
/// previous placement can still say its target was deleted, and every query
/// filters it out.
internal enum ReplicaApply {
    static func snapshot(_ page: InventorySnapshotPage, now: Date, in db: Database) throws {
        var meta = try SyncMeta.read(db)
        if let epoch = meta.epoch, epoch != page.epoch {
            try discardServerState(db)
            meta = SyncMeta(catalogue: meta.catalogue, snapshotTotal: 0, snapshotRows: 0)
        }
        try upsert(items: page.items, locations: page.locations, meta: meta, in: db)
        meta.epoch = page.epoch
        meta.catalogueVersion = page.catalogueVersion
        meta.snapshotTotal = page.total
        meta.snapshotRows += page.items.count + page.locations.count
        meta.snapshotCursor = page.nextCursor
        if page.nextCursor == nil {
            meta.since = page.highWaterSeq
            meta.lastRefreshAt = now
            meta.snapshotTotal = 0
            meta.snapshotRows = 0
        }
        try meta.write(db)
    }

    static func changes(_ page: InventoryChangesPage, now: Date, in db: Database) throws {
        var meta = try SyncMeta.read(db)
        guard let since = meta.since, let epoch = meta.epoch else {
            throw InventoryReplicaError.notDownloaded
        }
        guard epoch == page.epoch else {
            throw InventoryReplicaError.epochMismatch(stored: epoch, received: page.epoch)
        }
        try upsert(items: page.items, locations: page.locations, meta: meta, in: db)
        for event in page.events {
            try db.execute(
                sql: insertSQL(EventRow.columns, into: "event", onConflict: "DO NOTHING"),
                arguments: StatementArguments(try EventRow.values(of: event)))
        }
        meta.since = max(since, page.nextSince)
        meta.catalogueVersion = page.catalogueVersion
        if !page.hasMore { meta.lastRefreshAt = now }
        try meta.write(db)
    }

    /// Forgets every server row and where the feed stood, keeping only the
    /// catalogue, so the snapshot that follows a `409 resync_required` is
    /// the whole truth. Upserting by revision alone would keep a row the
    /// server no longer has, and ignore one whose revision a restored server
    /// rewound below the stored one, even within the same epoch.
    static func resetForResync(in db: Database) throws {
        let meta = try SyncMeta.read(db)
        try discardServerState(db)
        try SyncMeta(catalogue: meta.catalogue, snapshotTotal: 0, snapshotRows: 0).write(db)
    }

    static func store(_ catalogue: InventoryCatalogue, in db: Database) throws {
        var meta = try SyncMeta.read(db)
        meta.catalogue = try StoredJSON.encode(StoredCatalogue(catalogue))
        try meta.write(db)
        try ReplicaSearchIndex.reindexAll(catalogue: catalogue, in: db)
    }

    private static func upsert(
        items: [InventoryItem], locations: [InventoryLocation], meta: SyncMeta, in db: Database
    ) throws {
        let catalogue = try meta.storedCatalogue()
        for item in items {
            guard try isNewer(item.revision, id: item.id, in: "item_base", db) else { continue }
            let values = try ItemRow.values(of: item)
            try db.execute(
                sql: upsertSQL(ItemRow.columns, into: "item_base"),
                arguments: StatementArguments(values))
            try rebase(item, values: values, catalogue: catalogue, in: db)
        }
        for location in locations {
            guard try isNewer(location.revision, id: location.id, in: "location_base", db) else {
                continue
            }
            let arguments = StatementArguments(LocationRow.values(of: location))
            for table in ReplicaSchema.locationLayers {
                try db.execute(
                    sql: upsertSQL(LocationRow.columns, into: table), arguments: arguments)
            }
        }
    }

    /// Brings the optimistic `item` row in line with a new base. With no
    /// mutation log to replay over it, the base is the optimistic row.
    private static func rebase(
        _ item: InventoryItem, values: [(any DatabaseValueConvertible)?],
        catalogue: InventoryCatalogue?,
        in db: Database
    ) throws {
        try db.execute(
            sql: upsertSQL(ItemRow.columns, into: "item"), arguments: StatementArguments(values))
        try ReplicaSearchIndex.index(SearchDocument(item), catalogue: catalogue, in: db)
    }

    private static func isNewer(_ revision: Int, id: String, in table: String, _ db: Database)
        throws -> Bool
    {
        let stored = try Int.fetchOne(
            db, sql: "SELECT revision FROM \(table) WHERE id = ?", arguments: [id])
        return stored.map { revision > $0 } ?? true
    }

    /// A new epoch means a restored server whose revisions and `seq` no
    /// longer compare with anything stored, so everything the server owns
    /// goes. The catalogue stays: it is versioned by content, not by epoch.
    private static func discardServerState(_ db: Database) throws {
        for table in ReplicaSchema.itemLayers + ReplicaSchema.locationLayers + [
            "event", "item_fts",
        ] {
            try db.execute(sql: "DELETE FROM \(table)")
        }
    }

    private static func upsertSQL(_ columns: [String], into table: String) -> String {
        let assignments = columns.dropFirst().map { "\($0) = excluded.\($0)" }.joined(
            separator: ", ")
        return insertSQL(columns, into: table, onConflict: "DO UPDATE SET \(assignments)")
    }

    private static func insertSQL(_ columns: [String], into table: String, onConflict: String)
        -> String
    {
        let placeholders = Array(repeating: "?", count: columns.count).joined(separator: ", ")
        return """
            INSERT INTO \(table) (\(columns.joined(separator: ", "))) VALUES (\(placeholders))
            ON CONFLICT(\(columns[0])) \(onConflict)
            """
    }
}
