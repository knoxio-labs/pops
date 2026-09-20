import AppCore
import Foundation
import Observation

/// One event on the Recent activity page: its History line, naming the
/// record, and the record a revert has to name.
internal struct InventoryRecentActivity: Identifiable, Equatable, Sendable {
    internal let entry: InventoryActivityEntry
    internal let entityKind: InventoryEntityKind
    internal let entityId: String

    internal var id: Int { entry.seq }
}

/// Recent activity's state, over `InventoryStore`: the newest events across
/// every item and place, read as the item History page reads one item's,
/// and Undo on any of them.
@MainActor @Observable
internal final class InventoryRecentActivityModel {
    /// How many events the page reads. Recent, not the whole log.
    internal static let limit = 200

    internal let runner: InventoryCommandRunner
    internal let activity: InventoryObservation<[InventoryRecentActivity]>

    internal init(
        store: any InventoryStore, now: @escaping @Sendable () -> Date = { .now }
    ) {
        runner = InventoryCommandRunner(store: store)
        activity = InventoryObservation(
            store: store, query: Self.query(limit: Self.limit, now: now))
    }

    /// The newest `limit` events, newest first, each named for its record.
    /// A record since removed from the replica reads as a deleted record.
    internal static func query(
        limit: Int, now: @escaping @Sendable () -> Date, calendar: Calendar = .autoupdatingCurrent
    ) -> InventoryQuery<[InventoryRecentActivity]> {
        InventoryQuery { source in
            let entries = InventoryActivityEntries(source: source, now: now(), calendar: calendar)
            let events = source.inventoryRecentEvents(limit: limit).sorted { $0.seq > $1.seq }
            return events.map { event in
                var entry = entries.entry(for: event)
                entry.record = recordName(event, source: source)
                return InventoryRecentActivity(
                    entry: entry, entityKind: event.entityKind, entityId: event.entityId)
            }
        }
    }

    /// Follows the replica until the calling task is cancelled.
    internal func observe() async {
        await activity.observe()
    }

    internal var isLoading: Bool { activity.phase == .loading }

    internal var entries: [InventoryActivityEntry] {
        guard case .loaded(let activity) = activity.phase else { return [] }
        return activity.map(\.entry)
    }

    /// Reverts an event with a compensating one rather than editing it, so
    /// the log stays append-only. Does nothing for an event that can no
    /// longer be undone, or one the page no longer lists.
    internal func undo(_ entry: InventoryActivityEntry) async {
        guard entry.isUndoable, case .loaded(let activity) = activity.phase,
            let event = activity.first(where: { $0.id == entry.seq })
        else { return }
        let revert = InventoryCommand.revertEvent(
            seq: event.entry.seq, entityKind: event.entityKind, entityId: event.entityId)
        await runner.perform([revert])
    }

    nonisolated private static func recordName(
        _ event: InventoryEvent, source: any InventoryQuerySource
    )
        -> String
    {
        let name =
            switch event.entityKind {
            case .item: source.inventoryItem(id: event.entityId)?.name
            case .location: source.inventoryLocation(id: event.entityId)?.name
            }
        return name ?? InventorySyncEntityDisplay.unknown.name
    }
}
