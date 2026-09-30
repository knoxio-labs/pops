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
        .filter { InventoryItemPageDefaults.matches($0, filter: query.filter, source: self) }
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
            InventoryItemPageDefaults.searchOrder($0, $1, text: query.text)
        }
        return InventoryItemPageDefaults.searchPage(ordered, request: query.page, text: query.text)
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
            InventoryItemPageDefaults.matches($0, filter: query.filter, source: self)
        }
        let ordered = InventoryItemPageDefaults.ordered(rows, by: query.order, text: query.text)
        return InventoryItemPageDefaults.page(
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
        let matching = events.filter { InventoryItemPageDefaults.matches($0, filter: query.filter) }
            .sorted { $0.seq > $1.seq }
        return InventoryItemPageDefaults.page(matching, request: query.page)
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
                InventoryItemPageDefaults.typeKeys(for: $0, source: self).isEmpty
            }
            .count,
            createdRecently: active.filter { $0.createdAt >= createdSince }.count)
    }
}

private enum InventoryItemPageDefaults {
    static func matches(
        _ item: InventoryItem, filter: InventoryItemPageFilter, source: any InventoryQuerySource
    ) -> Bool {
        guard !item.isDeleted, filter.includeInactive || item.lifecycle == .active,
            !filter.excludeContainers || !item.isContainer,
            !filter.excludeContained || item.containment == nil,
            !filter.excludingIDs.contains(item.id),
            filter.excludingPlacement.map({ item.placement != $0 }) ?? true
        else { return false }

        let placementMatches =
            switch filter.placement {
            case .any: true
            case .hand: item.placement == .hand
            case .location:
                if case .location = item.placement { true } else { false }
            case .container:
                if case .container = item.placement { true } else { false }
            }
        guard placementMatches else { return false }

        let accessMatches =
            switch filter.access {
            case .any: true
            case .open: item.containment?.access == .open
            case .closed: item.containment?.access == .closed
            }
        guard accessMatches,
            filter.typeKey.map({ typeKeys(for: item, source: source).contains($0) }) ?? true,
            !filter.quantityGreaterThanOne || item.quantity.count > 1
        else { return false }

        let missingMatches =
            switch filter.missing {
            case .none: true
            case .type: typeKeys(for: item, source: source).isEmpty
            case .code: item.code == nil
            case .photo: item.photos.isEmpty
            }
        guard missingMatches else { return false }

        let rowSync = syncState(of: item.id, source: source)
        return switch filter.sync {
        case .any: true
        case .waiting: rowSync == .queued || rowSync == .saved || rowSync == .synchronizing
        case .stale: rowSync == .stale
        case .needsAttention: rowSync == .needsAttention
        }
    }

    static func matches(_ event: InventoryEvent, filter: InventoryEventPageFilter) -> Bool {
        switch filter {
        case .any: true
        case .moves: event.kind == .moved
        case .lifecycle:
            event.kind == .lifecycleChanged || event.kind == .deleted || event.kind == .restored
        case .lifecycleChanges: event.kind == .lifecycleChanged
        case .edits:
            event.kind != .moved && event.kind != .lifecycleChanged
                && event.kind != .deleted && event.kind != .restored
        }
    }

    static func typeKeys(for item: InventoryItem, source: any InventoryQuerySource) -> Set<String> {
        guard let catalogue = source.inventoryProtocol2Catalogue() else {
            return item.typeKey.map { [$0] } ?? []
        }
        let found =
            item.typeId.flatMap { id in catalogue.types.first { $0.id == id } }
            ?? item.typeKey.flatMap { key in catalogue.types.first { $0.key == key } }
        guard let found else { return item.typeKey.map { [$0] } ?? [] }
        return Set(catalogue.ancestry(ofType: found.id).map(\.key))
    }

    private static func syncState(of id: String, source: any InventoryQuerySource) -> InventorySync
    {
        let ledger = source.inventorySyncLedger()
        let repaired = ledger.repairs.contains { $0.entityId == id }
        let waiting = ledger.waiting.filter { $0.receipt.entityId == id }
        let status = source.inventoryReplicaStatus()
        let stale: Bool
        if case .stale = status { stale = true } else { stale = false }
        return InventorySync.derive(
            from: InventorySync.RowFacts(
                hasOpenRepair: repaired,
                isSynchronizing: waiting.contains { $0.progress != nil },
                isQueued: !waiting.isEmpty,
                isSaved: false,
                replicaIsStale: stale))
    }

    static func searchOrder(
        _ lhs: InventorySearchPageRow, _ rhs: InventorySearchPageRow, text: String
    ) -> Bool {
        let leftRank = searchRank(lhs.name, text)
        let rightRank = searchRank(rhs.name, text)
        if leftRank != rightRank { return leftRank < rightRank }
        if lhs.isLocation != rhs.isLocation { return !lhs.isLocation }
        switch lhs.name.localizedCaseInsensitiveCompare(rhs.name) {
        case .orderedAscending: return true
        case .orderedDescending: return false
        case .orderedSame: return lhs.id < rhs.id
        }
    }

    static func searchPage(
        _ rows: [InventorySearchPageRow], request: InventoryPageRequest, text: String
    ) -> InventoryPage<InventorySearchPageRow> {
        let afterCursor: (InventorySearchPageRow) -> Bool
        switch request.cursor {
        case nil: afterCursor = { _ in true }
        case .searchHitRank(let rank, let isLocation, let name, let id):
            afterCursor = {
                let rowRank = searchRank($0.name, text)
                if rowRank != rank { return rowRank > rank }
                if $0.isLocation != isLocation { return $0.isLocation }
                return nameAfter($0.name, $0.id, name, id)
            }
        default: return InventoryPage(rows: [], nextCursor: nil)
        }
        let slice = Array(rows.filter(afterCursor).prefix(request.limit + 1))
        let hasMore = slice.count > request.limit
        let pageRows = Array(slice.prefix(request.limit))
        let nextCursor =
            hasMore
            ? pageRows.last.map {
                InventoryPageCursor.searchHitRank(
                    rank: searchRank($0.name, text), isLocation: $0.isLocation, name: $0.name,
                    id: $0.id)
            } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    static func ordered(
        _ rows: [InventoryItem], by order: InventoryItemPageQuery.Order, text: String?
    ) -> [InventoryItem] {
        switch order {
        case .name:
            rows.sorted(by: nameOrder)
        case .createdAtNewest:
            rows.sorted { dateOrder($0.createdAt, $0.id, $1.createdAt, $1.id) }
        case .updatedAtNewest:
            rows.sorted { dateOrder($0.updatedAt, $0.id, $1.updatedAt, $1.id) }
        case .searchRelevance:
            rows.sorted { left, right in
                let leftRank = searchRank(left.name, text ?? "")
                let rightRank = searchRank(right.name, text ?? "")
                if leftRank != rightRank { return leftRank < rightRank }
                return nameOrder(left, right)
            }
        }
    }

    static func page(
        _ rows: [InventoryItem], request: InventoryPageRequest,
        order: InventoryItemPageQuery.Order, text: String?
    ) -> InventoryPage<InventoryItem> {
        let afterCursor: (InventoryItem) -> Bool
        switch request.cursor {
        case nil:
            afterCursor = { _ in true }
        case .itemName(let name, let id) where order == .name:
            afterCursor = { nameAfter($0, name: name, id: id) }
        case .itemCreatedAt(let date, let id) where order == .createdAtNewest:
            afterCursor = { dateAfter($0.createdAt, $0.id, date, id) }
        case .itemUpdatedAt(let date, let id) where order == .updatedAtNewest:
            afterCursor = { dateAfter($0.updatedAt, $0.id, date, id) }
        case .itemSearchRank(let rank, let name, let id) where order == .searchRelevance:
            afterCursor = {
                let itemRank = searchRank($0.name, text ?? "")
                return itemRank == rank ? nameAfter($0, name: name, id: id) : itemRank > rank
            }
        default:
            return InventoryPage(rows: [], nextCursor: nil)
        }
        let remaining = rows.filter(afterCursor)
        let slice = Array(remaining.prefix(request.limit + 1))
        let hasMore = slice.count > request.limit
        let pageRows = Array(slice.prefix(request.limit))
        let nextCursor =
            hasMore ? pageRows.last.map { cursor(for: $0, order: order, text: text) } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    static func page(
        _ rows: [InventoryEvent], request: InventoryPageRequest
    ) -> InventoryPage<InventoryEvent> {
        let afterCursor: (InventoryEvent) -> Bool
        switch request.cursor {
        case nil: afterCursor = { _ in true }
        case .eventSequence(let sequence): afterCursor = { $0.seq < sequence }
        default: return InventoryPage(rows: [], nextCursor: nil)
        }
        let remaining = rows.filter(afterCursor)
        let slice = Array(remaining.prefix(request.limit + 1))
        let hasMore = slice.count > request.limit
        let pageRows = Array(slice.prefix(request.limit))
        let nextCursor: InventoryPageCursor? =
            hasMore ? pageRows.last.map { InventoryPageCursor.eventSequence($0.seq) } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    private static func cursor(
        for item: InventoryItem, order: InventoryItemPageQuery.Order, text: String?
    ) -> InventoryPageCursor {
        switch order {
        case .name: .itemName(name: item.name, id: item.id)
        case .createdAtNewest: .itemCreatedAt(date: item.createdAt, id: item.id)
        case .updatedAtNewest: .itemUpdatedAt(date: item.updatedAt, id: item.id)
        case .searchRelevance:
            .itemSearchRank(rank: searchRank(item.name, text ?? ""), name: item.name, id: item.id)
        }
    }

    private static func searchRank(_ name: String, _ query: String) -> Int {
        guard !query.isEmpty else { return 2 }
        if name.range(of: query, options: [.caseInsensitive, .anchored]) != nil { return 0 }
        return name.localizedCaseInsensitiveContains(query) ? 1 : 2
    }

    private static func nameOrder(_ lhs: InventoryItem, _ rhs: InventoryItem) -> Bool {
        switch lhs.name.localizedCaseInsensitiveCompare(rhs.name) {
        case .orderedAscending: true
        case .orderedDescending: false
        case .orderedSame: lhs.id < rhs.id
        }
    }

    private static func dateOrder(
        _ lhsDate: Date, _ lhsID: String, _ rhsDate: Date, _ rhsID: String
    )
        -> Bool
    {
        lhsDate == rhsDate ? lhsID < rhsID : lhsDate > rhsDate
    }

    private static func nameAfter(_ item: InventoryItem, name: String, id: String) -> Bool {
        nameAfter(item.name, item.id, name, id)
    }

    private static func nameAfter(
        _ itemName: String, _ itemID: String, _ name: String, _ id: String
    )
        -> Bool
    {
        switch itemName.localizedCaseInsensitiveCompare(name) {
        case .orderedDescending: true
        case .orderedAscending: false
        case .orderedSame: itemID > id
        }
    }

    private static func dateAfter(_ itemDate: Date, _ itemID: String, _ date: Date, _ id: String)
        -> Bool
    {
        itemDate == date ? itemID > id : itemDate < date
    }
}

/// A stable position in one of Inventory's ordered list queries.
public enum InventoryPageCursor: Codable, Hashable, Sendable {
    case itemName(name: String, id: String)
    case itemCreatedAt(date: Date, id: String)
    case itemUpdatedAt(date: Date, id: String)
    case itemSearchRank(rank: Int, name: String, id: String)
    case searchHitRank(rank: Int, isLocation: Bool, name: String, id: String)
    case eventSequence(Int)
}

/// One searchable Inventory record or place in universal search order.
public enum InventorySearchPageRow: Hashable, Sendable {
    case item(InventoryItem)
    case location(InventoryLocation)

    /// The stable item or place identifier.
    public var id: String {
        switch self {
        case .item(let item): item.id
        case .location(let location): location.id
        }
    }

    /// The display name used for relevance ranking and stable ties.
    public var name: String {
        switch self {
        case .item(let item): item.name
        case .location(let location): location.name
        }
    }

    /// Whether this row represents a place rather than an item or container.
    public var isLocation: Bool {
        if case .location = self { true } else { false }
    }
}

/// Filters and cursor for one bounded universal-search page from Inventory.
public struct InventorySearchPageQuery: Hashable, Sendable {
    public let text: String
    public let filter: InventoryItemPageFilter
    public let includeLocations: Bool
    public let page: InventoryPageRequest

    /// Creates a page query for a search phrase and result filters.
    public init(
        text: String, filter: InventoryItemPageFilter = InventoryItemPageFilter(),
        includeLocations: Bool = true, page: InventoryPageRequest = InventoryPageRequest()
    ) {
        self.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        self.filter = filter
        self.includeLocations = includeLocations
        self.page = page
    }
}

/// A bounded request for one page of rows.
public struct InventoryPageRequest: Hashable, Sendable {
    public static let defaultLimit = 40
    public static let maximumLimit = 100

    public let limit: Int
    public let cursor: InventoryPageCursor?

    /// Creates a request with a limit clamped to Inventory's supported range.
    public init(limit: Int = Self.defaultLimit, cursor: InventoryPageCursor? = nil) {
        self.limit = min(max(limit, 1), Self.maximumLimit)
        self.cursor = cursor
    }
}

/// A bounded page and the cursor for the next page, when more rows remain.
public struct InventoryPage<Row: Hashable & Sendable>: Hashable, Sendable {
    public let rows: [Row]
    public let nextCursor: InventoryPageCursor?

    /// Creates a page with its rows and next cursor.
    public init(rows: [Row], nextCursor: InventoryPageCursor?) {
        self.rows = rows
        self.nextCursor = nextCursor
    }
}

/// The placement constraint for a paged inventory item query.
public enum InventoryItemPagePlacement: Hashable, Sendable {
    case any
    case hand
    case location
    case container
}

/// The container access constraint for a paged inventory item query.
public enum InventoryItemPageAccess: Hashable, Sendable {
    case any
    case open
    case closed
}

/// The missing-data constraint for a paged inventory item query.
public enum InventoryItemPageMissing: Hashable, Sendable {
    case none
    case type
    case code
    case photo
}

/// The row sync-state constraint for a paged inventory item query.
public enum InventoryItemPageSync: Hashable, Sendable {
    case any
    case waiting
    case stale
    case needsAttention
}

/// Filters applied to an item page before its limit is evaluated.
public struct InventoryItemPageFilter: Hashable, Sendable {
    public var includeInactive: Bool
    public var excludeContainers: Bool
    public var excludeContained: Bool
    public var placement: InventoryItemPagePlacement
    public var access: InventoryItemPageAccess
    public var typeKey: String?
    public var quantityGreaterThanOne: Bool
    public var missing: InventoryItemPageMissing
    public var sync: InventoryItemPageSync
    public var excludingIDs: Set<String>
    public var excludingPlacement: InventoryPlacement?

    /// Creates an item filter with the same defaults as Inventory's browse screen.
    public init(
        includeInactive: Bool = false,
        excludeContainers: Bool = false,
        excludeContained: Bool = false,
        placement: InventoryItemPagePlacement = .any,
        access: InventoryItemPageAccess = .any,
        typeKey: String? = nil,
        quantityGreaterThanOne: Bool = false,
        missing: InventoryItemPageMissing = .none,
        sync: InventoryItemPageSync = .any,
        excludingIDs: Set<String> = [],
        excludingPlacement: InventoryPlacement? = nil
    ) {
        self.includeInactive = includeInactive
        self.excludeContainers = excludeContainers
        self.excludeContained = excludeContained
        self.placement = placement
        self.access = access
        self.typeKey = typeKey
        self.quantityGreaterThanOne = quantityGreaterThanOne
        self.missing = missing
        self.sync = sync
        self.excludingIDs = excludingIDs
        self.excludingPlacement = excludingPlacement
    }
}

/// The filters, order, and cursor for one item-list page.
public struct InventoryItemPageQuery: Hashable, Sendable {
    public enum Order: Hashable, Sendable {
        case name
        case createdAtNewest
        case updatedAtNewest
        case searchRelevance
    }

    public let text: String?
    public let filter: InventoryItemPageFilter
    public let order: Order
    public let page: InventoryPageRequest

    /// Creates a page query. Search text is trimmed and empty text means no text filter.
    public init(
        text: String? = nil,
        filter: InventoryItemPageFilter = InventoryItemPageFilter(),
        order: Order = .name,
        page: InventoryPageRequest = InventoryPageRequest()
    ) {
        let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.text = trimmed?.isEmpty == false ? trimmed : nil
        self.filter = filter
        self.order = order
        self.page = page
    }
}

/// The event groups shown by Inventory's history filter.
public enum InventoryEventPageFilter: Hashable, Sendable {
    case any
    case moves
    case lifecycle
    case lifecycleChanges
    case edits
}

/// Which event collection a paged history query reads.
public enum InventoryEventPageScope: Hashable, Sendable {
    case all
    case item(String)
    case location(String)
}

/// The scope, history filter, and cursor for one event page.
public struct InventoryEventPageQuery: Hashable, Sendable {
    public let scope: InventoryEventPageScope
    public let filter: InventoryEventPageFilter
    public let page: InventoryPageRequest

    /// Creates a page query for recent activity or one entity's history.
    public init(
        scope: InventoryEventPageScope,
        filter: InventoryEventPageFilter = .any,
        page: InventoryPageRequest = InventoryPageRequest()
    ) {
        self.scope = scope
        self.filter = filter
        self.page = page
    }
}

/// Counts shown above the Items browser, computed without loading its rows.
public struct InventoryItemPageSummary: Hashable, Sendable {
    public let activeItems: Int
    public let inHand: Int
    public let untyped: Int
    public let createdRecently: Int

    /// Creates a summary of the browser's active, non-container rows.
    public init(activeItems: Int, inHand: Int, untyped: Int, createdRecently: Int) {
        self.activeItems = activeItems
        self.inHand = inHand
        self.untyped = untyped
        self.createdRecently = createdRecently
    }
}
