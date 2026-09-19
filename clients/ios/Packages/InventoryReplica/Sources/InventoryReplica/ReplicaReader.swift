import AppCore
import Foundation
import GRDB
import Synchronization

/// The `InventoryQuerySource` one `InventoryReplica.read(_:)` hands a query.
///
/// The protocol's reads cannot throw, and a replica read can. Rather than
/// answer an empty list as though it were true, the first failure is kept and
/// `read(_:)` throws it once the query returns, so a caller never mistakes a
/// broken read for an empty inventory.
internal final class ReplicaReader: InventoryQuerySource {
    private let database: DatabaseQueue
    private let now: Date
    private let staleAfter: TimeInterval
    private let activity: ReplicaActivity
    private let firstFailure = Mutex<(any Error)?>(nil)

    init(
        database: DatabaseQueue, now: Date, staleAfter: TimeInterval, activity: ReplicaActivity
    ) {
        self.database = database
        self.now = now
        self.staleAfter = staleAfter
        self.activity = activity
    }

    var failure: (any Error)? { firstFailure.withLock { $0 } }

    func inventoryItem(id: String) -> InventoryItem? {
        attempt(nil) { try ReplicaQueries.item(id: id, in: $0) }
    }

    func inventoryItem(withCode code: String) -> InventoryItem? {
        attempt(nil) { try ReplicaQueries.item(withCode: code, in: $0) }
    }

    func inventoryLocation(id: String) -> InventoryLocation? {
        attempt(nil) { try ReplicaQueries.location(id: id, in: $0) }
    }

    func inventoryLocationTree() -> [InventoryLocation] {
        attempt([]) { try ReplicaQueries.locationTree(in: $0) }
    }

    func inventoryContents(ofLocation locationId: String) -> [InventoryItem] {
        attempt([]) { try ReplicaPlacement.contents(ofLocation: locationId, in: $0) }
    }

    func inventoryContents(ofContainer containerId: String) -> [InventoryItem] {
        attempt([]) { try ReplicaQueries.contents(ofContainer: containerId, in: $0) }
    }

    func inventoryInHand() -> [InventoryItem] {
        attempt([]) { try ReplicaQueries.inHand(in: $0) }
    }

    func inventoryOpenContainers() -> [InventoryItem] {
        attempt([]) { try ReplicaQueries.openContainers(in: $0) }
    }

    func inventoryContainers() -> [InventoryItem] {
        attempt([]) { try ReplicaQueries.containers(in: $0) }
    }

    func inventoryItems(includeInactive: Bool) -> [InventoryItem] {
        attempt([]) { try ReplicaQueries.items(includeInactive: includeInactive, in: $0) }
    }

    func inventoryRecents(limit: Int) -> [InventoryItem] {
        attempt([]) { try ReplicaQueries.recents(limit: limit, in: $0) }
    }

    func inventoryRecentEvents(limit: Int) -> [InventoryEvent] {
        attempt([]) { try ReplicaQueries.recentEvents(limit: limit, in: $0) }
    }

    func inventoryCounts() -> InventoryCounts {
        attempt(InventoryCounts(items: 0, containers: 0, locations: 0)) {
            try ReplicaQueries.counts(in: $0)
        }
    }

    func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem] {
        attempt([]) {
            try ReplicaSearchIndex.search(text, includeInactive: includeInactive, in: $0)
        }
    }

    func inventoryItemHistory(itemId: String) -> [InventoryEvent] {
        attempt([]) { try ReplicaQueries.history(of: .item, id: itemId, in: $0) }
    }

    func inventoryLocationHistory(locationId: String) -> [InventoryEvent] {
        attempt([]) { try ReplicaQueries.history(of: .location, id: locationId, in: $0) }
    }

    func inventoryCatalogue() -> InventoryCatalogue {
        attempt(InventoryReplica.emptyCatalogue) {
            try SyncMeta.read($0).storedCatalogue() ?? InventoryReplica.emptyCatalogue
        }
    }

    /// What waits for the server, in log order; the open repairs, oldest
    /// first; and what was resolved, newest first.
    func inventorySyncLedger() -> InventoryReplicaSyncLedger {
        attempt(InventoryReplicaSyncLedger()) { db in
            InventoryReplicaSyncLedger(
                waiting: try MutationLogLedger.waiting(in: db),
                repairs: try RepairRows.openRepairs(in: db).compactMap(\.repair),
                resolved: try RepairRows.resolvedEntries(in: db))
        }
    }

    func inventoryReplicaStatus() -> InventoryReplicaStatus {
        attempt(.empty) { db in
            let meta = try SyncMeta.read(db)
            return activity.overlay(
                on: meta.status(now: now, staleAfter: staleAfter), lastRefreshAt: meta.lastRefreshAt
            )
        }
    }

    func inventoryPhotoUploads() -> [String: InventoryPhotoUpload] {
        attempt([:]) { try MediaRows.uploads(in: $0) }
    }

    private func attempt<Value>(_ fallback: Value, _ read: (Database) throws -> Value) -> Value {
        do {
            return try database.read(read)
        } catch {
            firstFailure.withLock { $0 = $0 ?? error }
            return fallback
        }
    }
}
