import AppCore
import Foundation

/// What the Items browser reads, from one state of the store: every item
/// that is not a container, which of them the current query matched, the
/// types the filter offers, and whether the replica is cut off.
internal struct InventoryItemsCatalogue: Equatable, Sendable {
    internal let records: [InventoryRecord]
    /// The records the replica's search matched, or nil with no query, when
    /// every record is in play.
    internal let matched: Set<InventoryItem.ID>?
    internal let types: [InventoryTypeName]
    internal let offline: InventoryOfflineState?

    /// Reads `text` through the replica's own search, so the browser finds
    /// exactly what Search would; inactive items are read only when the
    /// filter includes them.
    internal static func query(
        text: String, includeInactive: Bool
    ) -> InventoryQuery<InventoryItemsCatalogue> {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return InventoryQuery { source in
            let reader = InventoryRecordReader(source: source)
            return InventoryItemsCatalogue(
                records: source.inventoryItems(includeInactive: includeInactive)
                    .filter { $0.containment == nil }
                    .map(reader.record),
                matched: trimmed.isEmpty
                    ? nil
                    : Set(
                        source.inventorySearch(text: trimmed, includeInactive: includeInactive)
                            .map(\.id)),
                types: reader.typeNames,
                offline: InventoryOfflineState(source.inventoryReplicaStatus()))
        }
    }
}

/// The replica being cut off from the server, and since when, as the notice
/// line under a browser's title says it.
internal struct InventoryOfflineState: Equatable, Sendable {
    internal let lastRefreshAt: Date?

    /// Nil unless the replica is offline or stale.
    internal init?(_ status: InventoryReplicaStatus) {
        switch status {
        case .offline(let at), .stale(let at): lastRefreshAt = at
        case .empty, .downloading, .current, .refreshing, .blocked: return nil
        }
    }

    internal func line(now: Date = .now) -> String {
        guard let lastRefreshAt else { return "Offline" }
        return "Offline · updated \(InventoryRelativeTime.text(lastRefreshAt, now: now))"
    }
}

/// One titled run of the Items list.
internal struct InventoryItemSection: Identifiable, Equatable {
    internal let title: String
    internal let records: [InventoryRecord]

    internal var id: String { title }

    /// This week and earlier when sorted by recency; one section per initial
    /// when sorted by name. Records keep the order they arrive in, and empty
    /// sections are left out.
    internal static func sections(
        _ records: [InventoryRecord], by sort: InventoryItemSort, now: Date
    ) -> [InventoryItemSection] {
        switch sort {
        case .recent:
            return [
                InventoryItemSection(
                    title: "This week", records: records.filter { $0.isRecent(now: now) }),
                InventoryItemSection(
                    title: "Earlier", records: records.filter { !$0.isRecent(now: now) }),
            ]
            .filter { !$0.records.isEmpty }
        case .name:
            var order: [String] = []
            var grouped: [String: [InventoryRecord]] = [:]
            for record in records {
                let initial = record.name.prefix(1).uppercased()
                if grouped[initial] == nil { order.append(initial) }
                grouped[initial, default: []].append(record)
            }
            return order.map { InventoryItemSection(title: $0, records: grouped[$0] ?? []) }
        }
    }
}
