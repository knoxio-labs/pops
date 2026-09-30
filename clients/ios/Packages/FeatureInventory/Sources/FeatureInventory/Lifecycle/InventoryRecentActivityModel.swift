import AppCore
import Foundation
import Observation

/// One event on a history page, with the record a revert must name.
internal struct InventoryRecentActivity: Identifiable, Hashable, Sendable {
    internal let entry: InventoryActivityEntry
    internal let entityKind: InventoryEntityKind
    internal let entityId: String

    internal var id: Int { entry.seq }
}

private struct InventoryHistoryObservationKey: Equatable, Sendable {
    let scope: InventoryEventPageScope
    let kind: InventoryHistoryKind?
}

/// The paged state for one item's history or the cross-record Recent activity screen.
@MainActor @Observable
internal final class InventoryRecentActivityModel {
    internal static let limit = InventoryPageRequest.defaultLimit

    internal let runner: InventoryCommandRunner
    internal private(set) var activity: InventoryObservation<[InventoryRecentActivity]>
    internal private(set) var isLoadingNextPage = false
    internal private(set) var nextPageFailed = false
    internal var kind: InventoryHistoryKind?

    private let store: any InventoryStore
    private let scope: InventoryEventPageScope
    private let now: @Sendable () -> Date
    private let calendar: Calendar
    private var activeKey: InventoryHistoryObservationKey
    private var firstPage: [InventoryRecentActivity] = []
    private var appendedActivities: [InventoryRecentActivity] = []
    private var loadedIDs: Set<Int> = []
    private var nextCursor: InventoryPageCursor?
    private var activePageRequestID: UUID?

    internal init(
        store: any InventoryStore, scope: InventoryEventPageScope = .all,
        now: @escaping @Sendable () -> Date = { .now },
        calendar: Calendar = .autoupdatingCurrent
    ) {
        self.store = store
        self.scope = scope
        self.now = now
        self.calendar = calendar
        activeKey = InventoryHistoryObservationKey(scope: scope, kind: nil)
        runner = InventoryCommandRunner(store: store)
        activity = Self.observation(
            store: store, key: InventoryHistoryObservationKey(scope: scope, kind: nil),
            now: now, calendar: calendar)
    }

    internal var rows: [InventoryRecentActivity] { firstPage + appendedActivities }
    internal var entries: [InventoryActivityEntry] { rows.map(\.entry) }
    internal var canLoadMore: Bool { nextCursor != nil }
    internal var isLoading: Bool { activity.phase == .loading }

    /// Follows the filtered first page and resets later pages when its boundary changes.
    internal func observe() async {
        let key = InventoryHistoryObservationKey(scope: scope, kind: kind)
        if key != activeKey {
            activeKey = key
            resetPages()
        }
        activity = Self.observation(
            store: store, key: key, now: now, calendar: calendar
        ) { [weak self] activities in
            self?.receiveFirstPage(activities, for: key)
        }
        await activity.observe()
    }

    /// Reads the next filtered event page without moving the cursor on failure.
    internal func loadNextPage() async {
        guard !isLoadingNextPage, let cursor = nextCursor else { return }
        let key = activeKey
        let requestID = UUID()
        activePageRequestID = requestID
        isLoadingNextPage = true
        nextPageFailed = false
        var answered = false
        for await page in store.observe(Self.pageQuery(
            key: key, cursor: cursor, now: now(), calendar: calendar))
        {
            guard !Task.isCancelled, activeKey == key, activePageRequestID == requestID else {
                break
            }
            answered = true
            for activity in page.rows where loadedIDs.insert(activity.id).inserted {
                appendedActivities.append(activity)
            }
            nextCursor = page.nextCursor
            break
        }
        if !answered && activeKey == key && activePageRequestID == requestID {
            nextPageFailed = true
        }
        if activePageRequestID == requestID {
            activePageRequestID = nil
            isLoadingNextPage = false
        }
    }

    internal func retryNextPage() async {
        await loadNextPage()
    }

    /// Reverts a visible, still-undoable event against the entity it records.
    internal func undo(_ entry: InventoryActivityEntry) async {
        guard entry.isUndoable,
            let activity = rows.first(where: { $0.entry.seq == entry.seq })
        else { return }
        _ = await runner.perform([
            .revertEvent(
                seq: entry.seq, entityKind: activity.entityKind, entityId: activity.entityId)
        ])
    }

    /// Reads the newest `limit` events, preserving the older bounded query seam used by tests.
    internal static func query(
        limit: Int, now: @escaping @Sendable () -> Date,
        calendar: Calendar = .autoupdatingCurrent
    ) -> InventoryQuery<[InventoryRecentActivity]> {
        let page = pageQuery(
            key: InventoryHistoryObservationKey(scope: .all, kind: nil),
            cursor: nil, limit: limit, now: now(), calendar: calendar)
        return InventoryQuery { page.read($0).rows }
    }

    private func receiveFirstPage(
        _ activities: [InventoryRecentActivity], for key: InventoryHistoryObservationKey
    ) {
        guard activeKey == key else { return }
        if !firstPage.isEmpty && firstPage != activities {
            appendedActivities = []
            isLoadingNextPage = false
            activePageRequestID = nil
            nextPageFailed = false
        }
        firstPage = activities
        loadedIDs = Set(activities.map(\.id))
        nextCursor = activities.count == Self.limit
            ? activities.last.map { .eventSequence($0.entry.seq) } : nil
    }

    private func resetPages() {
        firstPage = []
        appendedActivities = []
        loadedIDs = []
        nextCursor = nil
        isLoadingNextPage = false
        nextPageFailed = false
        activePageRequestID = nil
    }

    private static func observation(
        store: any InventoryStore, key: InventoryHistoryObservationKey,
        now: @escaping @Sendable () -> Date, calendar: Calendar,
        onValue: (([InventoryRecentActivity]) -> Void)? = nil
    ) -> InventoryObservation<[InventoryRecentActivity]> {
        let page = pageQuery(
            key: key, cursor: nil, limit: Self.limit, now: now(), calendar: calendar)
        return InventoryObservation(
            store: store, query: InventoryQuery { page.read($0).rows }, onValue: onValue)
    }

    private static func pageQuery(
        key: InventoryHistoryObservationKey, cursor: InventoryPageCursor?,
        now: Date, calendar: Calendar
    ) -> InventoryQuery<InventoryPage<InventoryRecentActivity>> {
        pageQuery(
            key: key, cursor: cursor, limit: Self.limit, now: now, calendar: calendar)
    }

    private static func pageQuery(
        key: InventoryHistoryObservationKey, cursor: InventoryPageCursor?, limit: Int,
        now: Date, calendar: Calendar
    ) -> InventoryQuery<InventoryPage<InventoryRecentActivity>> {
        let filter = pageFilter(key.kind)
        let query = InventoryEventPageQuery(
            scope: key.scope, filter: filter,
            page: InventoryPageRequest(limit: limit, cursor: cursor))
        return InventoryQuery { source in
            let page = source.inventoryEventPage(query)
            let entries = InventoryActivityEntries(source: source, now: now, calendar: calendar)
            let rows = page.rows.map { event -> InventoryRecentActivity in
                var entry = entries.entry(for: event)
                if case .all = key.scope {
                    entry.record = recordName(event, source: source)
                }
                return InventoryRecentActivity(
                    entry: entry, entityKind: event.entityKind, entityId: event.entityId)
            }
            return InventoryPage(rows: rows, nextCursor: page.nextCursor)
        }
    }

    private static func pageFilter(_ kind: InventoryHistoryKind?) -> InventoryEventPageFilter {
        switch kind {
        case nil: .any
        case .move: .moves
        case .lifecycle: .lifecycle
        case .edit: .edits
        }
    }

    private nonisolated static func recordName(
        _ event: InventoryEvent, source: any InventoryQuerySource
    ) -> String {
        let name = switch event.entityKind {
        case .item: source.inventoryItem(id: event.entityId)?.name
        case .location: source.inventoryLocation(id: event.entityId)?.name
        }
        return name ?? InventorySyncEntityDisplay.unknown.name
    }
}
