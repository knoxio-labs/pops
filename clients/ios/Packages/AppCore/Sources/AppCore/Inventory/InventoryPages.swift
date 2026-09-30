import Foundation

extension InventoryQuerySource {
    /// Reads a bounded record and place search page from the source's array reads. Replica-backed
    /// stores override this so searchable text, filters, ordering, and limits run in SQLite.
    public func inventorySearchPage(
        _ query: InventorySearchPageQuery
    ) -> InventoryPage<InventorySearchPageRow> {
        let items = inventorySearch(
            text: query.text, includeInactive: query.filter.includeInactive
        )
        .filter { InventoryItemPageFiltering.matches($0, filter: query.filter, source: self) }
        .map(InventorySearchPageRow.item)
        let locations: [InventorySearchPageRow] =
            query.includeLocations
            ? inventoryLocationTree()
                .filter {
                    !$0.isDeleted && $0.name.localizedCaseInsensitiveContains(query.text)
                }
                .map(InventorySearchPageRow.location)
            : []
        let ordered = (items + locations).sorted {
            InventoryItemPageOrdering.searchOrder($0, $1, text: query.text)
        }
        return InventoryItemPageOrdering.searchPage(ordered, request: query.page, text: query.text)
    }

    /// Reads a page using the source's array reads. Durable replicas override this with SQL so
    /// search, filters, ordering, and the page boundary share one database query.
    public func inventoryItemPage(
        _ query: InventoryItemPageQuery
    ) -> InventoryPage<InventoryItem> {
        let items =
            query.text.map {
                inventorySearch(text: $0, includeInactive: query.filter.includeInactive)
            } ?? inventoryItems(includeInactive: query.filter.includeInactive)
        let rows = items.filter {
            InventoryItemPageFiltering.matches($0, filter: query.filter, source: self)
        }
        let ordered = InventoryItemPageOrdering.ordered(rows, by: query.order, text: query.text)
        return InventoryItemPageOrdering.page(
            ordered, request: query.page, order: query.order, text: query.text)
    }

    /// Reads a page using the source's history reads. Durable replicas override this with SQL so
    /// the entity and kind filters run before the page limit.
    public func inventoryEventPage(
        _ query: InventoryEventPageQuery
    ) -> InventoryPage<InventoryEvent> {
        let events: [InventoryEvent] =
            switch query.scope {
            case .all: inventoryRecentEvents(limit: Int.max)
            case .item(let id): inventoryItemHistory(itemId: id)
            case .location(let id): inventoryLocationHistory(locationId: id)
            }
        let matching = events.filter {
            InventoryItemPageFiltering.matches($0, filter: query.filter)
        }
        .sorted { $0.seq > $1.seq }
        return InventoryItemPageOrdering.page(matching, request: query.page)
    }

    /// Computes the Items browser summary from the source's existing catalogue read.
    public func inventoryItemPageSummary(createdSince: Date) -> InventoryItemPageSummary {
        let items = inventoryItems(includeInactive: true).filter {
            !$0.isDeleted && !$0.isContainer
        }
        let active = items.filter { $0.lifecycle == .active }
        return InventoryItemPageSummary(
            activeItems: active.count,
            inHand: active.filter { $0.placement == .hand }.count,
            untyped: active.filter {
                InventoryItemPageFiltering.typeKeys(for: $0, source: self).isEmpty
            }
            .count,
            createdRecently: active.filter { $0.createdAt >= createdSince }.count)
    }
}
