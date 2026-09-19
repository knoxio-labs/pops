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
/// Either held in memory, for tests and previews, or on disk under
/// `init(onDiskAt:)` (POPS-4069) so a relaunch reads what the last sync
/// stored instead of downloading again.
public final class InventoryReplica: Sendable {
    /// What `InventoryQuery.catalogue` answers before any catalogue is
    /// stored: no types, no units, and an empty version that no server
    /// catalogue carries.
    public static let emptyCatalogue = InventoryCatalogue(version: "", units: [], types: [])

    let database: DatabaseQueue
    private let now: @Sendable () -> Date
    private let staleAfter: TimeInterval
    private let observers = ReplicaObservers()
    private let activity = Mutex(ReplicaActivity())

    /// Where photo variants are cached on disk, excluded from backup because
    /// they are recreatable from the server (ADR-002 D11). `nil` for an
    /// in-memory replica, which has nowhere to cache to.
    public let mediaCacheDirectory: URL?

    /// An in-memory replica, for tests and previews: rows live as long as
    /// this instance, and a relaunch downloads again.
    ///
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
        self.mediaCacheDirectory = nil
    }

    /// The durable, on-disk replica (POPS-4069, ADR-002 D11): WAL journalling
    /// with `synchronous = FULL` so a commit survives power loss, database
    /// and media cache under `FileProtectionType.completeUntilFirstUserAuthentication`
    /// so a scheduled refresh can still read and write after first unlock,
    /// and the media cache excluded from backup (the database is not: it can
    /// hold unsynced work).
    ///
    /// - Parameters:
    ///   - directory: Where the replica lives, typically Application
    ///     Support. Created if missing, along with a `MediaCache`
    ///     subdirectory under it.
    ///   - freeBytes: The free space to check before opening, in bytes, given
    ///     `directory`. `nil` (the default) reads the real volume; tests
    ///     inject a fixed value.
    /// - Throws: ``AppCore/InventoryStorageError/full`` if `freeBytes`
    ///   answers under 200 MB, or if opening or migrating the database itself
    ///   hits `SQLITE_FULL`. A migration that fails for any other reason
    ///   falls back to a fresh snapshot (`ReplicaSchema.openOnDisk(at:)`).
    public init(
        onDiskAt directory: URL,
        now: @escaping @Sendable () -> Date = { Date() },
        staleAfter: TimeInterval = 24 * 60 * 60,
        freeBytes: ((URL) throws -> Int64)? = nil
    ) throws {
        let freeBytes = freeBytes ?? ReplicaStorage.systemFreeBytes(at:)
        try ReplicaStorage.ensureFreeSpace { try freeBytes(directory) }
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let mediaCacheDirectory = directory.appendingPathComponent("MediaCache", isDirectory: true)
        try fileManager.createDirectory(
            at: mediaCacheDirectory, withIntermediateDirectories: true)
        let databasePath = directory.appendingPathComponent("inventory.sqlite").path
        database = try ReplicaStorage.mappingFull {
            try ReplicaSchema.openOnDisk(at: databasePath)
        }
        try Self.excludeFromBackup(mediaCacheDirectory)
        try Self.applyFileProtection(to: directory)
        try Self.applyFileProtection(to: mediaCacheDirectory)
        self.now = now
        self.staleAfter = staleAfter
        self.mediaCacheDirectory = mediaCacheDirectory
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

    /// Runs `body` in one write transaction and tells every observer once
    /// it commits.
    func write<Value>(_ body: (Database) throws -> Value) throws -> Value {
        let value = try ReplicaStorage.mappingFull { try database.write(body) }
        observers.notify()
        return value
    }

    /// `.isExcludedFromBackup`: recreatable from the server, unlike the
    /// database, which can hold work the server has not seen yet.
    private static func excludeFromBackup(_ url: URL) throws {
        var url = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }

    /// `FileProtectionType.completeUntilFirstUserAuthentication` (ADR-002
    /// D11), so a background refresh can still read and write after first
    /// unlock. Only meaningful on iOS: the type does not exist on the macOS
    /// host `swift test` runs on.
    private static func applyFileProtection(to url: URL) throws {
        #if os(iOS)
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: url.path)
        #endif
    }
}
