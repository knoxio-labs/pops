import AppCore
import Foundation
import GRDB

/// Where the replica stands against the server: which epoch it was built
/// from, the `seq` the change feed resumes after, and how far a snapshot in
/// progress has got.
public struct InventoryReplicaSyncPosition: Hashable, Sendable {
    /// The server epoch every stored row belongs to (ADR-002 D10), nil before
    /// the first snapshot page.
    public let epoch: String?
    /// The `seq` to ask the change feed for rows after. Nil until a snapshot
    /// has completed, which is what makes a feed page before then an error.
    public let since: Int?
    /// The cursor a download interrupted mid-snapshot resumes from.
    public let snapshotCursor: String?
    /// The catalogue version the server last named on a snapshot or feed page.
    public let announcedCatalogueVersion: String?
    /// The version of the catalogue actually stored, if any.
    public let storedCatalogueVersion: String?

    /// Whether the server has named a catalogue this replica does not hold,
    /// which is the signal to fetch `GET /types` again.
    public var needsCatalogue: Bool {
        guard let announcedCatalogueVersion else { return false }
        return announcedCatalogueVersion != storedCatalogueVersion
    }
}

/// The single `sync_meta` row, read and written whole.
internal struct SyncMeta {
    var epoch: String?
    var since: Int?
    var catalogue: String?
    var catalogueVersion: String?
    var lastRefreshAt: Date?
    var snapshotCursor: String?
    var snapshotTotal: Int
    var snapshotRows: Int

    static func read(_ db: Database) throws -> SyncMeta {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM sync_meta WHERE id = 1") else {
            throw InventoryReplicaError.corruptValue("sync_meta has no row")
        }
        return SyncMeta(
            epoch: try row.decode(forColumn: "epoch"), since: try row.decode(forColumn: "since"),
            catalogue: try row.decode(forColumn: "catalogue"),
            catalogueVersion: try row.decode(forColumn: "catalogue_version"),
            lastRefreshAt: try date(row, "last_refresh_at"),
            snapshotCursor: try row.decode(forColumn: "snapshot_cursor"),
            snapshotTotal: try row.decode(forColumn: "snapshot_total"),
            snapshotRows: try row.decode(forColumn: "snapshot_rows"))
    }

    func write(_ db: Database) throws {
        try db.execute(
            sql: """
                UPDATE sync_meta SET epoch = ?, since = ?, catalogue = ?, catalogue_version = ?,
                    last_refresh_at = ?, snapshot_cursor = ?, snapshot_total = ?, snapshot_rows = ?
                WHERE id = 1
                """,
            arguments: [
                epoch, since, catalogue, catalogueVersion, lastRefreshAt.map(storedDate),
                snapshotCursor, snapshotTotal, snapshotRows,
            ])
    }

    func storedCatalogue() throws -> InventoryCatalogue? {
        try catalogue.map { try StoredJSON.decode(StoredCatalogue.self, from: $0).domainValue() }
    }

    func position() throws -> InventoryReplicaSyncPosition {
        InventoryReplicaSyncPosition(
            epoch: epoch, since: since, snapshotCursor: snapshotCursor,
            announcedCatalogueVersion: catalogueVersion,
            storedCatalogueVersion: try storedCatalogue()?.version)
    }

    /// Per ADR-002's per-replica state machine, as far as stored facts can
    /// say: a snapshot in progress is downloading, one never started is
    /// empty, and a completed one is current until its last complete refresh
    /// is older than `staleAfter`. Offline, refreshing and blocked depend on
    /// the network and the session, which only the store driving the
    /// replica sees; `ReplicaActivity` layers them on top.
    func status(now: Date, staleAfter: TimeInterval) -> InventoryReplicaStatus {
        if snapshotCursor != nil {
            let progress = snapshotTotal > 0 ? Double(snapshotRows) / Double(snapshotTotal) : 0
            return .downloading(progress: min(progress, 1))
        }
        guard since != nil else { return .empty }
        guard let lastRefreshAt, now.timeIntervalSince(lastRefreshAt) <= staleAfter else {
            return .stale(lastRefreshAt: lastRefreshAt)
        }
        return .current
    }
}
