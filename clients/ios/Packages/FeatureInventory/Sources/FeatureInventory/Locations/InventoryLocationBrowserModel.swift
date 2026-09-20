import AppCore
import Foundation
import Observation

/// The locations browser's state, over `InventoryStore`: the whole tree in
/// one query, whether the replica is cut off, the search text, and New place.
@MainActor @Observable
internal final class InventoryLocationBrowserModel {
    internal let runner: InventoryCommandRunner
    internal let tree: InventoryObservation<InventoryLocationTree>
    internal let offline: InventoryObservation<InventoryOfflineState?>
    internal var query = ""
    internal var creating = false
    private let now: @Sendable () -> Date

    internal init(store: any InventoryStore, now: @escaping @Sendable () -> Date = { .now }) {
        self.now = now
        runner = InventoryCommandRunner(store: store)
        tree = InventoryObservation(
            store: store, query: InventoryQuery { InventoryLocationTree(reading: $0) })
        offline = InventoryObservation(
            store: store,
            query: InventoryQuery { InventoryOfflineState($0.inventoryReplicaStatus()) })
    }

    /// Follows the replica until the calling task is cancelled.
    internal func observe() async {
        async let tree: Void = tree.observe()
        async let offline: Void = offline.observe()
        _ = await (tree, offline)
    }

    /// The line under the title while the replica is offline or stale, the
    /// same line the Items browser shows; nil while it is current.
    internal var offlineLine: String? {
        guard case .loaded(let state?) = offline.phase else { return nil }
        return state.line(now: now())
    }
}
