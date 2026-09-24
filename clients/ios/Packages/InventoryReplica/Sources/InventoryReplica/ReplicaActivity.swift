import AppCore
import Foundation

/// What the replica's stored facts cannot say about its own state: whether a
/// download or refresh is running right now, whether the last attempt to
/// reach the server failed, and whether the server has refused this session
/// or this build. `OnlineInventoryStore` sets it; the replica only layers it
/// over the status its stored facts derive.
internal struct ReplicaActivity: Hashable, Sendable {
    var isDownloading = false
    var isRefreshing = false
    var isOffline = false
    var blocked: InventoryBlockReason?
    /// Set by the drain when a pass stopped on a failure no network retry
    /// fixes, cleared by the next pass that gets through; the Sync ledger
    /// carries it.
    var sendingStall: InventorySendingStall?

    /// Layers these facts over the stored status, following ADR-002's
    /// per-replica state machine: blocked wins over everything; a download in
    /// progress shows its progress (from nothing, before its first page
    /// lands); a refresh shows as refreshing whether the replica was current
    /// or stale; and an unreachable server shows as offline until the
    /// replica's age makes it stale, which is the louder of the two.
    func overlay(on stored: InventoryReplicaStatus, lastRefreshAt: Date?)
        -> InventoryReplicaStatus
    {
        if let blocked { return .blocked(reason: blocked) }
        switch stored {
        case .empty:
            return isDownloading ? .downloading(progress: 0) : .empty
        case .downloading:
            return !isDownloading && isOffline ? .offline(lastRefreshAt: lastRefreshAt) : stored
        case .stale:
            return isRefreshing ? .refreshing : stored
        case .current:
            if isRefreshing { return .refreshing }
            return isOffline ? .offline(lastRefreshAt: lastRefreshAt) : .current
        case .refreshing, .offline, .blocked:
            return stored
        }
    }
}
