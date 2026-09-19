import AppCore
import Foundation
import GRDB
import Synchronization

/// The phone's copy of the inventory (ADR-002 D11): the rows the server's
/// snapshot and change feed deliver, the served type catalogue, and every
/// read the Inventory screens make, answered from this device.
///
/// It performs no HTTP. Whoever drives it fetches pages through
/// `InventorySyncTransport` and hands them to `apply(_:)`, so what a page
/// means for the replica is tested here without a network.
///
/// The database is held in memory: rows live as long as this instance, and a
/// relaunch downloads again.
public final class InventoryReplica: Sendable {
    /// What `InventoryQuery.catalogue` answers before any catalogue is
    /// stored: no types, no units, and an empty version that no server
    /// catalogue carries.
    public static let emptyCatalogue = InventoryCatalogue(version: "", units: [], types: [])

    private let database: DatabaseQueue
    private let now: @Sendable () -> Date
    private let staleAfter: TimeInterval
    private let observers = ReplicaObservers()
    private let activity = Mutex(ReplicaActivity())

    /// - Parameters:
    ///   - now: The clock `last_refresh_at` is stamped with and staleness is
    ///     measured against.
    ///   - staleAfter: How long after its last complete refresh the replica
    ///     reports itself stale. ADR-002 leaves the threshold to the owner and
    ///     names 24 hours as the default until they answer.
    public init(
        now: @escaping @Sendable () -> Date = { Date() },
        staleAfter: TimeInterval = 24 * 60 * 60
    ) throws {
        database = try DatabaseQueue()
        try ReplicaSchema.migrator().migrate(database)
        self.now = now
        self.staleAfter = staleAfter
    }

    /// Where the next snapshot or feed request should start.
    public func syncPosition() throws -> InventoryReplicaSyncPosition {
        try database.read { try SyncMeta.read($0).position() }
    }

    /// Stores one snapshot page. The last page (no `nextCursor`) completes
    /// the download: the change feed then resumes after the page's
    /// high-water `seq`. A page from a new epoch first discards every row the
    /// old epoch left, keeping only the catalogue.
    public func apply(_ page: InventorySnapshotPage) throws {
        try write { try ReplicaApply.snapshot(page, now: now(), in: $0) }
    }

    /// Stores one change-feed page: rows (tombstones included) by revision,
    /// and its events for history.
    ///
    /// - Throws: ``InventoryReplicaError/notDownloaded`` before a snapshot
    ///   has completed, and ``InventoryReplicaError/epochMismatch(stored:received:)``
    ///   for a page from another epoch. Either way nothing is written.
    public func apply(_ page: InventoryChangesPage) throws {
        try write { try ReplicaApply.changes(page, now: now(), in: $0) }
    }

    /// Stores the served catalogue and re-indexes search, because type
    /// labels are searchable.
    public func store(_ catalogue: InventoryCatalogue) throws {
        try write { try ReplicaApply.store(catalogue, in: $0) }
    }

    /// Answers one query against the current state.
    ///
    /// - Throws: The first database error any read inside the query hit.
    public func read<Value: Sendable>(_ query: InventoryQuery<Value>) throws -> Value {
        let reader = ReplicaReader(
            database: database, now: now(), staleAfter: staleAfter,
            activity: activity.withLock { $0 })
        let value = query.read(reader)
        if let failure = reader.failure { throw failure }
        return value
    }

    /// Streams a query's value now and again after every write that
    /// commits, keeping only the newest value a slow reader has not taken.
    /// The stream finishes with the error if a read fails.
    public func observe<Value: Sendable>(
        _ query: InventoryQuery<Value>
    ) -> AsyncThrowingStream<Value, any Error> {
        AsyncThrowingStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            let id = UUID()
            continuation.onTermination = { [observers] _ in observers.remove(id) }
            register(
                id, query, yield: { continuation.yield($0) },
                finish: { continuation.finish(throwing: $0) })
        }
    }

    /// `observe(_:)` for `InventoryStore`'s non-throwing stream: a failed
    /// read ends the stream rather than yielding an empty value that would
    /// read as an empty inventory.
    internal func observeUntilFailure<Value: Sendable>(
        _ query: InventoryQuery<Value>
    ) -> AsyncStream<Value> {
        AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            let id = UUID()
            continuation.onTermination = { [observers] _ in observers.remove(id) }
            register(
                id, query, yield: { continuation.yield($0) }, finish: { _ in continuation.finish() }
            )
        }
    }

    /// Changes what the replica reports about its own activity, and tells
    /// every observer, since a status read depends on it.
    internal func updateActivity(_ change: (inout ReplicaActivity) -> Void) {
        let changed = activity.withLock { current in
            let before = current
            change(&current)
            return current != before
        }
        if changed { observers.notify() }
    }

    /// Discards every server row and the feed position ahead of a fresh
    /// snapshot, keeping the catalogue (`ReplicaApply.resetForResync`).
    internal func resetForResync() throws {
        try write { try ReplicaApply.resetForResync(in: $0) }
    }

    /// Where an item is, walked outward through its containers to the
    /// location that ends the chain (ADR-002 D2). Nil for an item this
    /// replica does not hold or holds only as a tombstone.
    public func placementTrail(ofItem id: String) throws -> InventoryPlacementTrail? {
        try database.read { try ReplicaPlacement.trail(ofItem: id, in: $0) }
    }

    private func register<Value: Sendable>(
        _ id: UUID, _ query: InventoryQuery<Value>, yield: @escaping @Sendable (Value) -> Void,
        finish: @escaping @Sendable (any Error) -> Void
    ) {
        observers.add(id) { [self] in
            do {
                yield(try read(query))
            } catch {
                finish(error)
            }
        }
    }

    private func write(_ body: (Database) throws -> Void) throws {
        try database.write(body)
        observers.notify()
    }
}
