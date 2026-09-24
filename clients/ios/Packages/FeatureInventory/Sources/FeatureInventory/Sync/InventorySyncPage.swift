import AppCore
import Foundation

/// Everything the Sync page draws, read from one state of the store: the
/// replica's own status and its ledger of waiting, needing-attention and
/// resolved changes never disagree with each other, because both come from
/// the same snapshot.
internal struct InventorySyncPage: Equatable, Sendable {
    internal let status: InventoryReplicaStatus
    internal let ledger: InventoryReplicaSyncLedger
    internal let resolvedToday: Int
    /// Every row, resolved against the same read as `status` and `ledger`:
    /// a name looked up after this state has moved on would show the wrong
    /// record for the row it is drawn beside.
    internal let waitingRows: [InventorySyncWaitingRow]
    internal let repairRows: [InventorySyncRepairRow]
    internal let resolvedRows: [InventorySyncResolvedRow]

    internal static func query() -> InventoryQuery<InventorySyncPage> {
        InventoryQuery { InventorySyncPage(reading: $0) }
    }

    internal init(reading source: any InventoryQuerySource, now: Date = .now) {
        status = source.inventoryReplicaStatus()
        let ledger = source.inventorySyncLedger()
        self.ledger = ledger
        let calendar = Calendar.current
        resolvedToday =
            ledger.resolved.filter { calendar.isDate($0.resolvedAt, inSameDayAs: now) }
            .count
        waitingRows = Self.buildWaitingRows(ledger, reading: source)
        repairRows = Self.buildRepairRows(ledger, reading: source)
        resolvedRows = Self.buildResolvedRows(ledger, reading: source)
    }

    /// The batch the drain currently has in flight, if any.
    internal var sending: [InventoryQueuedMutation] {
        ledger.waiting.filter { $0.progress != nil }
    }
}

/// The Sync page's header line: whether this phone can reach the server, and
/// when it last did. Distinct from `InventoryDashboardSync` (the dashboard's
/// quiet pill, silent when current): the header always says something,
/// because the whole point of this page is to say where sync stands.
internal enum InventorySyncHeaderStatus: Equatable {
    case online(lastRefreshAt: Date?)
    case offline(lastRefreshAt: Date?)
    case syncing(count: Int)
    /// Sending is stuck on something no network retry fixes
    /// (`InventorySendingStall`): louder than offline, since what is waiting
    /// is not moving whatever the network does.
    case stuck(waiting: Int)
    /// A change waits for fields newer than this phone's, which the next
    /// refresh fetches.
    case updatingFields

    internal static func derive(page: InventorySyncPage) -> Self {
        let sendingCount = page.sending.count
        let holds = page.ledger.waiting.compactMap(\.hold)
        if case .blocked = page.status { return .offline(lastRefreshAt: nil) }
        if page.ledger.sendingStall != nil || holds.contains(.stalled) {
            return .stuck(waiting: page.ledger.waiting.count)
        }
        switch page.status {
        case .offline(let since), .stale(let since):
            return .offline(lastRefreshAt: since)
        case .refreshing where sendingCount > 0:
            return .syncing(count: sendingCount)
        case .empty, .downloading, .current, .refreshing, .blocked:
            break
        }
        if sendingCount > 0 { return .syncing(count: sendingCount) }
        if holds.contains(.waitingForFields) { return .updatingFields }
        return .online(lastRefreshAt: nil)
    }
}
