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
    /// Integer catalogue revision announced by protocol 2, when in use.
    public let announcedCatalogueRevision: Int?
    /// The announced protocol-2 revision when its immutable snapshot is present locally.
    public let storedCatalogueRevision: Int?

    /// Whether the server has named a catalogue this replica does not hold,
    /// which is the signal to fetch `GET /types` again.
    public var needsCatalogue: Bool {
        if let announcedCatalogueRevision {
            return announcedCatalogueRevision != storedCatalogueRevision
        }
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
    var catalogueRevision: Int?
    var lastRefreshAt: Date?
    var snapshotCursor: String?
    var snapshotTotal: Int
    var snapshotRows: Int
    var typeArrivals: StoredTypeArrivals

    /// A position with nothing downloaded, for a replica starting over from
    /// a fresh snapshot. The catalogue and the type arrivals are kept: the
    /// catalogue is versioned by content rather than by epoch, and which
    /// types this phone already asked about is its own record, not the
    /// server's.
    func startingOver() -> SyncMeta {
        SyncMeta(
            catalogue: catalogue, catalogueRevision: catalogueRevision, snapshotTotal: 0,
            snapshotRows: 0, typeArrivals: typeArrivals)
    }

    static func read(_ db: Database) throws -> SyncMeta {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM sync_meta WHERE id = 1") else {
            throw InventoryReplicaError.corruptValue("sync_meta has no row")
        }
        return SyncMeta(
            epoch: try row.decode(forColumn: "epoch"), since: try row.decode(forColumn: "since"),
            catalogue: try row.decode(forColumn: "catalogue"),
            catalogueVersion: try row.decode(forColumn: "catalogue_version"),
            catalogueRevision: try row.decode(forColumn: "catalogue_revision"),
            lastRefreshAt: try date(row, "last_refresh_at"),
            snapshotCursor: try row.decode(forColumn: "snapshot_cursor"),
            snapshotTotal: try row.decode(forColumn: "snapshot_total"),
            snapshotRows: try row.decode(forColumn: "snapshot_rows"),
            typeArrivals: try StoredJSON.decode(
                StoredTypeArrivals.self, from: try row.decode(forColumn: "type_arrivals")))
    }

    func write(_ db: Database) throws {
        try db.execute(
            sql: """
                UPDATE sync_meta SET epoch = ?, since = ?, catalogue = ?, catalogue_version = ?,
                    catalogue_revision = ?,
                    last_refresh_at = ?, snapshot_cursor = ?, snapshot_total = ?, snapshot_rows = ?,
                    type_arrivals = ?
                WHERE id = 1
                """,
            arguments: [
                epoch, since, catalogue, catalogueVersion, catalogueRevision,
                lastRefreshAt.map(storedDate),
                snapshotCursor, snapshotTotal, snapshotRows, try StoredJSON.encode(typeArrivals),
            ])
    }

    func storedCatalogue() throws -> InventoryCatalogue? {
        try catalogue.map { try StoredJSON.decode(StoredCatalogue.self, from: $0).domainValue() }
    }

    /// The catalogue to index items against: the stored protocol-2 revision
    /// when one is in use, since `catalogue` (protocol 1) is never written
    /// alongside it, falling back to the legacy protocol-1 catalogue
    /// otherwise.
    func searchCatalogue(in db: Database) throws -> InventoryCatalogue? {
        if let revision = catalogueRevision,
            let snapshot = try Protocol2CatalogueRows.read(revision: revision, in: db)
        {
            return Protocol2SearchIndex.searchableCatalogue(snapshot)
        }
        return try storedCatalogue()
    }

    func position(in db: Database) throws -> InventoryReplicaSyncPosition {
        let storedRevision = try catalogueRevision.flatMap { revision in
            try Int.fetchOne(
                db, sql: "SELECT revision FROM catalogue_revision WHERE revision = ?",
                arguments: [revision])
        }
        return InventoryReplicaSyncPosition(
            epoch: epoch, since: since, snapshotCursor: snapshotCursor,
            announcedCatalogueVersion: catalogueVersion,
            storedCatalogueVersion: try storedCatalogue()?.version,
            announcedCatalogueRevision: catalogueRevision,
            storedCatalogueRevision: storedRevision)
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
