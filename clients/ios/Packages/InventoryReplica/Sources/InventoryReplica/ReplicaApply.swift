import AppCore
import Foundation
import GRDB

/// Writes a snapshot or change-feed page into the replica, one transaction
/// per page (the caller's `write`).
///
/// Rows are upserted by revision (ADR-002 D9): a row whose revision is not
/// above the stored one is ignored, which is what makes a snapshot page that
/// raced a feed page, or a page delivered twice, harmless. The one exception
/// is an item the server re-sent at the same revision with a newer `seq`
/// because an item its computed values read changed: nothing it owns moved,
/// but its evaluations did, so it replaces the stored row like a newer one.
/// A tombstone is an ordinary newer revision carrying `deletedAt`; the row
/// stays so a remembered
/// previous placement can still say its target was deleted, and every query
/// filters it out.
internal enum ReplicaApply {
    /// `resyncing` marks the first page of the snapshot that answers a
    /// `409 resync_required`: it forgets every server row and where the feed
    /// stood before storing its own, in the same transaction, so the snapshot
    /// is the whole truth. Upserting by revision alone would keep a row the
    /// server no longer has, and ignore one whose revision a restored server
    /// rewound below the stored one, even within the same epoch.
    static func snapshot(
        _ page: InventorySnapshotPage, now: Date, resyncing: Bool = false, in db: Database
    ) throws {
        try requireCatalogue(page.catalogueRevision, in: db)
        var meta = try SyncMeta.read(db)
        let catalogueMoved = meta.catalogueRevision != page.catalogueRevision
        if resyncing || meta.epoch.map({ $0 != page.epoch }) == true {
            try discardServerState(db)
            meta = meta.startingOver()
        }
        let changed = try upsert(items: page.items, locations: page.locations, in: db)
        meta.epoch = page.epoch
        meta.catalogueVersion = page.catalogueVersion
        meta.catalogueRevision = page.catalogueRevision
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
        try MutationLogReplay.rebase(resetting: changed, in: db)
        if catalogueMoved { try LocalComputedValues.refreshForCatalogueChange(in: db) }
        try RepairSettlement.settleResolvedElsewhere(at: now, in: db)
    }

    static func changes(_ page: InventoryChangesPage, now: Date, in db: Database) throws {
        try requireCatalogue(page.catalogueRevision, in: db)
        var meta = try SyncMeta.read(db)
        guard let since = meta.since, let epoch = meta.epoch else {
            throw InventoryReplicaError.notDownloaded
        }
        guard epoch == page.epoch else {
            throw InventoryReplicaError.epochMismatch(stored: epoch, received: page.epoch)
        }
        let catalogueMoved = meta.catalogueRevision != page.catalogueRevision
        let changed = try upsert(items: page.items, locations: page.locations, in: db)
        for event in page.events {
            try db.execute(
                sql: insertSQL(EventRow.columns, into: "event", onConflict: "DO NOTHING"),
                arguments: StatementArguments(try EventRow.values(of: event)))
        }
        meta.since = max(since, page.nextSince)
        meta.catalogueVersion = page.catalogueVersion
        meta.catalogueRevision = page.catalogueRevision
        if !page.hasMore { meta.lastRefreshAt = now }
        try meta.write(db)
        try MutationLogReplay.rebase(resetting: changed, in: db)
        if catalogueMoved { try LocalComputedValues.refreshForCatalogueChange(in: db) }
        try RepairSettlement.settleResolvedElsewhere(at: now, in: db)
    }

    /// Stores `catalogue` over the previous one, queueing a type arrival for
    /// every type it adds (`InventoryTypeArrival.addedTypeKeys(from:to:)`).
    static func store(_ catalogue: InventoryCatalogue, in db: Database) throws {
        var meta = try SyncMeta.read(db)
        meta.typeArrivals.queue(
            InventoryTypeArrival.addedTypeKeys(from: try meta.storedCatalogue(), to: catalogue))
        meta.catalogue = try StoredJSON.encode(StoredCatalogue(catalogue))
        try meta.write(db)
        try ReplicaSearchIndex.reindexAll(catalogue: SearchCatalogue.read(in: db), in: db)
    }

    /// Stores the page's rows in the base layer by revision, and names every
    /// row that changed so the rebase that follows resets it in the
    /// optimistic layer and replays this phone's pending changes over it.
    private static func upsert(
        items: [InventoryItem], locations: [InventoryLocation], in db: Database
    ) throws -> Set<EntityRef> {
        var changed: Set<EntityRef> = []
        for item in items {
            guard try isNewer(item, in: db) else { continue }
            let fieldValues = try ReplicaValueKinds.conformed(item.fieldValues, in: db)
            let computedValues = try ReplicaValueKinds.conformed(item.computedValues, in: db)
            try db.execute(
                sql: upsertSQL(ItemRow.columns, into: "item_base"),
                arguments: StatementArguments(try ItemRow.values(of: item)))
            try Protocol2FieldValueRows.replace(
                itemId: item.id, entries: fieldValues, in: "item_field_value_base", db)
            try ComputedValueRows.replace(itemId: item.id, values: computedValues, in: db)
            changed.insert(.item(item.id))
        }
        for location in locations {
            guard try isNewer(location.revision, id: location.id, in: "location_base", db) else {
                continue
            }
            try db.execute(
                sql: upsertSQL(LocationRow.columns, into: "location_base"),
                arguments: StatementArguments(LocationRow.values(of: location)))
            changed.insert(.location(location.id))
        }
        return changed
    }

    private static func isNewer(_ item: InventoryItem, in db: Database) throws -> Bool {
        let stored = try Row.fetchOne(
            db, sql: "SELECT revision, seq FROM item_base WHERE id = ?", arguments: [item.id])
        guard let stored else { return true }
        let revision: Int = stored["revision"]
        let seq: Int = stored["seq"]
        return item.revision > revision || (item.revision == revision && item.seq > seq)
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
    /// goes, as it does for a resync. The catalogue and the type arrivals
    /// stay: the catalogue is versioned by content, not by epoch.
    private static func discardServerState(_ db: Database) throws {
        for table in ReplicaSchema.itemLayers + ReplicaSchema.fieldValueLayers
            + ReplicaSchema.locationLayers
            + ["event", "item_fts", ComputedValueRows.tableName, ComputedValueRows.localTableName]
        {
            try db.execute(sql: "DELETE FROM \(table)")
        }
    }

    private static func requireCatalogue(_ revision: Int?, in db: Database) throws {
        guard let revision else { return }
        let exists =
            try Bool.fetchOne(
                db,
                sql: "SELECT EXISTS (SELECT 1 FROM catalogue_revision WHERE revision = ?)",
                arguments: [revision]) ?? false
        guard exists else {
            throw InventoryReplicaError.corruptValue("catalogue revision \(revision) is not stored")
        }
    }

    static func upsertSQL(_ columns: [String], into table: String) -> String {
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
