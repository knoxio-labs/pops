import AppCore
import Foundation

/// A bounded Items browser answer, with every active filter already applied by the source.
internal struct InventoryItemsCatalogue: Equatable, Sendable {
    internal let records: [InventoryRecord]
    internal let nextCursor: InventoryPageCursor?
    internal let types: [InventoryTypeName]
    internal let offline: InventoryOfflineState?
    internal let summary: InventoryItemPageSummary

    internal static func query(
        text: String, filter: InventorySearchFilter, sort: InventoryItemSort,
        page: InventoryPageRequest, now: Date
    ) -> InventoryQuery<InventoryItemsCatalogue> {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let itemQuery = InventoryItemPageQuery(
            text: trimmed,
            filter: InventoryItemPageFilter(
                includeInactive: filter.includesInactive,
                excludeContainers: true,
                placement: pagePlacement(filter.placement),
                access: pageAccess(filter.containerState),
                typeKey: filter.type?.key,
                quantityGreaterThanOne: filter.quantity == .several,
                missing: pageMissing(filter.missing),
                sync: pageSync(filter.sync)),
            order: sort == .name ? .name : .createdAtNewest,
            page: page)
        let recentCutoff = now.addingTimeInterval(-7 * 24 * 60 * 60)
        return InventoryQuery { source in
            let reader = InventoryRecordReader(source: source)
            let page = source.inventoryItemPage(itemQuery)
            return InventoryItemsCatalogue(
                records: page.rows.map(reader.record), nextCursor: page.nextCursor,
                types: reader.typeNames,
                offline: InventoryOfflineState(source.inventoryReplicaStatus()),
                summary: source.inventoryItemPageSummary(createdSince: recentCutoff))
        }
    }

    private static func pagePlacement(
        _ placement: InventoryPlacementFilter
    ) -> InventoryItemPagePlacement {
        switch placement {
        case .any: .any
        case .inHand: .hand
        case .direct: .location
        case .contained: .container
        }
    }

    private static func pageAccess(
        _ state: InventoryContainerStateFilter
    ) -> InventoryItemPageAccess {
        switch state {
        case .any: .any
        case .open: .open
        case .closed: .closed
        }
    }

    private static func pageMissing(_ missing: InventoryMissingFilter) -> InventoryItemPageMissing {
        switch missing {
        case .nothing: .none
        case .type: .type
        case .code: .code
        case .photo: .photo
        }
    }

    private static func pageSync(_ sync: InventorySyncFilter) -> InventoryItemPageSync {
        switch sync {
        case .any: .any
        case .waiting: .waiting
        case .stale: .stale
        case .needsAttention: .needsAttention
        }
    }
}

/// The replica being cut off from the server, and since when, as the Items browser says.
internal struct InventoryOfflineState: Equatable, Sendable {
    internal let lastRefreshAt: Date?

    /// Nil unless the replica is offline or stale.
    internal init?(_ status: InventoryReplicaStatus) {
        switch status {
        case .offline(let at), .stale(let at): lastRefreshAt = at
        case .empty, .downloading, .current, .refreshing, .syncFailed, .blocked: return nil
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

    /// This week and earlier when sorted by recency; one section per initial when sorted by name.
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
