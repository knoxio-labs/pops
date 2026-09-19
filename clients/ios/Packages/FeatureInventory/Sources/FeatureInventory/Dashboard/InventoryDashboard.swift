import AppCore
import Foundation

/// Everything the dashboard draws, read from one state of the store so the
/// sections can never disagree with each other: an item put back leaves In
/// hand and lands in its container's count in the same frame.
internal struct InventoryDashboard: Equatable, Sendable {
    /// Nothing has been downloaded to this phone yet.
    internal let isFirstRun: Bool
    internal let sync: InventoryDashboardSync
    internal let counts: InventoryCounts
    internal let openContainers: [OpenContainer]
    internal let inHand: [InHandItem]
    internal let recentWork: [Activity]

    /// An open container's row: where it stands and how much is in it.
    internal struct OpenContainer: Identifiable, Equatable, Sendable {
        internal let id: InventoryItem.ID
        internal let name: String
        /// The location the container ends up in once its own containers are
        /// walked outward, or nil when that chain ends in someone's hand.
        internal let place: String?
        internal let itemCount: Int
        internal let updatedAt: Date
    }

    /// A thing picked up and not put anywhere yet.
    internal struct InHandItem: Identifiable, Equatable, Sendable {
        internal let id: InventoryItem.ID
        internal let name: String
        /// Set exactly when the item is a container.
        internal let access: InventoryAccess?
        internal let quantity: InventoryQuantity
        internal let sync: InventorySync
        /// The first photo's content hash, for the row's thumbnail.
        internal let photo: String?
        internal let previous: InventoryPreviousPlace
    }

    /// One line of Recent work, built from an event.
    internal struct Activity: Identifiable, Equatable, Sendable {
        internal let id: Int
        /// The record the event is about, which a revert has to name.
        internal let entityKind: InventoryEntityKind
        internal let entityId: String
        internal let title: String
        /// Where the thing the event is about is now.
        internal let place: String?
        internal let at: Date
        internal let symbol: String
        /// Whether Undo is offered: the event is still the latest change to
        /// each field it touched (D4).
        internal let isUndoable: Bool
        /// The page a tap on the row opens: the item, container or place the
        /// event is about, or nil once that record is gone, when the row
        /// opens Recent activity instead.
        internal let route: InventoryRoute?
    }

    /// How many items the open containers hold between them.
    internal var openItemCount: Int {
        openContainers.reduce(0) { $0 + $1.itemCount }
    }
}

/// Where an in-hand item came from, and so whether Put back has anywhere to
/// go.
internal enum InventoryPreviousPlace: Equatable, Sendable {
    /// A place that still exists. `placement` is what Put back moves it to.
    case place(name: String, placement: InventoryPlacement)
    /// The place remembered has since been deleted.
    case deleted
    /// Nothing was remembered.
    case nowhere

    /// Put back needs somewhere to go; a closed container still takes it
    /// back.
    internal var putBackPlacement: InventoryPlacement? {
        guard case .place(_, let placement) = self else { return nil }
        return placement
    }
}

/// The sync pill beside Browse, as the approved dashboard states draw it.
internal enum InventoryDashboardSync: Equatable, Sendable {
    /// Silent: the pill is not drawn.
    case current
    /// Offline or stale, with when the last complete refresh finished.
    case offline(since: Date?)
    /// Downloading or sending, as a fraction.
    case synchronizing(progress: Double)
    /// Open repairs waiting for a person.
    case needsAttention(count: Int)

    /// Reads the pill from the replica's state and its ledger. Repairs come
    /// first because they are the only state that waits for a person; then a
    /// download, which is the whole replica arriving; then being cut off;
    /// then a batch in flight.
    internal static func derive(
        status: InventoryReplicaStatus, ledger: InventoryReplicaSyncLedger
    ) -> InventoryDashboardSync {
        if !ledger.repairs.isEmpty { return .needsAttention(count: ledger.repairs.count) }
        switch status {
        case .downloading(let progress):
            return .synchronizing(progress: progress)
        case .offline(let since), .stale(let since):
            return .offline(since: since)
        case .blocked:
            return .offline(since: nil)
        case .empty, .current, .refreshing:
            break
        }
        if let progress = ledger.waiting.compactMap(\.progress).first {
            return .synchronizing(progress: progress)
        }
        return .current
    }
}
