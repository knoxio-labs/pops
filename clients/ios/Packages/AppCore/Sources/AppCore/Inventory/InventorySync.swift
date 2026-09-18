/// What the phone knows about a change relative to the server.
///
/// Two orderings live here and must not be confused. The *progress* order is
/// the one a change moves through: saved, queued, synchronizing,
/// synchronized. The *prominence* order is how loudly to show it, and there
/// synchronized and saved are both silent, saved is where the phone spends
/// most of its time, and it must not look like a problem.
public enum InventorySync: Hashable, Sendable, CaseIterable {
    case saved
    case queued
    case synchronizing
    case synchronized
    case stale
    case needsAttention

    public var prominence: InventorySyncProminence {
        switch self {
        case .saved, .synchronized: .silent
        case .queued, .synchronizing: .quiet
        case .stale: .visible
        case .needsAttention: .urgent
        }
    }

    public var label: String {
        switch self {
        case .saved: "Saved"
        case .queued: "Waiting to sync"
        case .synchronizing: "Syncing"
        case .synchronized: "Synced"
        case .stale: "May be out of date"
        case .needsAttention: "Needs attention"
        }
    }

    /// The facts a query needs to derive one row's `InventorySync`, per the
    /// sync state machine in ADR-002's iOS replica design. Nothing here is
    /// stored: a replica computes this on every read from its mutation log
    /// and its open repairs, so a row never disagrees with the state that
    /// produced it.
    public struct RowFacts: Hashable, Sendable {
        /// The row has a repair that has not been resolved.
        public let hasOpenRepair: Bool
        /// One of the row's pending mutations is in the drain's current batch.
        public let isSynchronizing: Bool
        /// The row has a pending mutation the drain has attempted or skipped.
        public let isQueued: Bool
        /// The row has a pending mutation not yet attempted.
        public let isSaved: Bool
        /// The replica as a whole has gone stale.
        public let replicaIsStale: Bool

        public init(
            hasOpenRepair: Bool,
            isSynchronizing: Bool,
            isQueued: Bool,
            isSaved: Bool,
            replicaIsStale: Bool
        ) {
            self.hasOpenRepair = hasOpenRepair
            self.isSynchronizing = isSynchronizing
            self.isQueued = isQueued
            self.isSaved = isSaved
            self.replicaIsStale = replicaIsStale
        }
    }

    /// Derives a row's sync state from its facts, in the fixed precedence the
    /// replica design states: needs attention over synchronizing over queued
    /// over saved over stale, with synchronized as the silent default.
    public static func derive(from facts: RowFacts) -> InventorySync {
        if facts.hasOpenRepair { return .needsAttention }
        if facts.isSynchronizing { return .synchronizing }
        if facts.isQueued { return .queued }
        if facts.isSaved { return .saved }
        if facts.replicaIsStale { return .stale }
        return .synchronized
    }
}

public enum InventorySyncProminence: Int, Comparable, Sendable {
    case silent
    case quiet
    case visible
    case urgent

    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}
