import AppCore
import Foundation
import GRDB

/// Rebuilds the optimistic layer (ADR-002 D11, "Two row layers"): every row
/// a feed page changed, or any logged mutation wrote, is reset to its base,
/// and every mutation still ahead of the base is replayed over it in log
/// order, corrected so nothing replays before what it depends on (a Restore
/// logged after the change it brings back). Rows nothing touched already
/// equal their base and are left alone.
///
/// A replayed mutation the reducer now refuses (its target deleted
/// elsewhere, say) is skipped and stays logged: the server has the final
/// word, and its outcome is what opens a repair.
///
/// Replay also keeps base revisions honest. The first pending change to an
/// entity keeps the revision its author saw, which is what lets the server
/// spot a conflicting edit made elsewhere. A change behind another of this
/// phone's changes to the same entity is based on the revision that one
/// leaves, recomputed on every rebase, so neither the feed nor an applied
/// outcome can leave it conflicting with this phone's own earlier edit.
internal enum MutationLogReplay {
    static func rebase(resetting changed: Set<EntityRef>, in db: Database) throws {
        let since = try SyncMeta.read(db).since
        let entries = DrainOrder.ordered(
            try MutationLogRows.replayable(since: since, in: db), id: \.mutationId,
            dependsOn: \.dependsOn)
        let replaying = Set(entries.map(\.mutationId))
        var stale = changed
        for var entry in try MutationLogRows.entriesWithTouchedRows(in: db) {
            stale.formUnion(entry.touched)
            if !replaying.contains(entry.mutationId) {
                entry.touched = []
                try MutationLogRows.update(entry, in: db)
            }
        }
        let catalogue = try SyncMeta.read(db).storedCatalogue()
        for ref in stale { try resetView(ref, catalogue: catalogue, in: db) }
        var written: Set<EntityRef> = []
        for var entry in entries {
            try replay(&entry, after: &written, in: db)
            try MutationLogRows.update(entry, in: db)
        }
    }

    private static func replay(
        _ entry: inout LogEntry, after written: inout Set<EntityRef>, in db: Database
    ) throws {
        entry.touched = []
        if let revision = entry.outcome?.appliedRevision,
            try baseRevision(of: entry.entity, in: db) ?? 0 >= revision
        {
            return
        }
        if entry.state == .queued || entry.state == .deferred, entry.baseRevision != nil {
            entry.baseRevision = try rebasedRevision(
                entry, isChained: written.contains(entry.entity), in: db)
        }
        let application: LocalApplication
        do {
            application = try LocalReducer.apply(
                entry.command, primary: entry.entity,
                at: Date(timeIntervalSinceReferenceDate: entry.createdAt), in: db)
        } catch is InventoryCommandError {
            return
        }
        entry.touched = application.touched
        entry.change = application.change
        written.formUnion(application.touched)
        if let revision = entry.outcome?.appliedRevision {
            try setViewRevision(revision, of: entry.entity, in: db)
        }
    }

    /// Behind another of this phone's changes: the revision that one left.
    /// First in line: the stored one, unless a cancelled predecessor left it
    /// ahead of anything the server has sent. A change sent again from a
    /// conflict never drops below the revision the conflict reported, which
    /// the feed may not have delivered yet.
    private static func rebasedRevision(_ entry: LogEntry, isChained: Bool, in db: Database)
        throws -> Int?
    {
        let view = try viewRevision(of: entry.entity, in: db)
        if isChained { return view ?? entry.baseRevision }
        guard let stored = entry.baseRevision, let base = try baseRevision(of: entry.entity, in: db)
        else { return entry.baseRevision }
        let floor = try RepairRows.baseRevisionFloor(reissuedAs: entry.mutationId, in: db)
        return max(min(stored, base), floor ?? 0)
    }

    static func resetView(
        _ ref: EntityRef, catalogue: InventoryCatalogue?, in db: Database
    ) throws {
        let (layer, columns) = layer(of: ref)
        guard try exists(ref, in: "\(layer)_base", db) else {
            if ref.kind == "item" {
                try db.execute(
                    sql: "DELETE FROM item_field_value WHERE item_id = ?", arguments: [ref.id])
                try db.execute(
                    sql: "DELETE FROM item_fts WHERE rowid = (SELECT rowid FROM item WHERE id = ?)",
                    arguments: [ref.id])
            }
            try db.execute(sql: "DELETE FROM \(layer) WHERE id = ?", arguments: [ref.id])
            return
        }
        let assignments = columns.dropFirst().map { "\($0) = excluded.\($0)" }.joined(
            separator: ", ")
        let list = columns.joined(separator: ", ")
        try db.execute(
            sql: """
                INSERT INTO \(layer) (\(list)) SELECT \(list) FROM \(layer)_base WHERE id = ?
                ON CONFLICT(id) DO UPDATE SET \(assignments)
                """, arguments: [ref.id])
        if ref.kind == "item" {
            try Protocol2FieldValueRows.copyBaseToView(itemId: ref.id, in: db)
        }
        if ref.kind == "item", let item = try ReplicaQueries.storedItem(id: ref.id, in: db) {
            try ReplicaSearchIndex.index(SearchDocument(item), catalogue: catalogue, in: db)
        }
    }

    private static func layer(of ref: EntityRef) -> (String, [String]) {
        ref.kind == "item" ? ("item", ItemRow.columns) : ("location", LocationRow.columns)
    }

    private static func exists(_ ref: EntityRef, in table: String, _ db: Database) throws -> Bool {
        try Bool.fetchOne(
            db, sql: "SELECT EXISTS (SELECT 1 FROM \(table) WHERE id = ?)", arguments: [ref.id])
            ?? false
    }

    static func baseRevision(of ref: EntityRef, in db: Database) throws -> Int? {
        try Int.fetchOne(
            db, sql: "SELECT revision FROM \(layer(of: ref).0)_base WHERE id = ?",
            arguments: [ref.id])
    }

    private static func viewRevision(of ref: EntityRef, in db: Database) throws -> Int? {
        try Int.fetchOne(
            db, sql: "SELECT revision FROM \(layer(of: ref).0) WHERE id = ?", arguments: [ref.id])
    }

    /// An applied change's row carries the revision the server gave it, not
    /// the reducer's prediction, until the feed delivers the row itself.
    private static func setViewRevision(_ revision: Int, of ref: EntityRef, in db: Database) throws
    {
        try db.execute(
            sql: "UPDATE \(layer(of: ref).0) SET revision = ? WHERE id = ?",
            arguments: [revision, ref.id])
    }
}
