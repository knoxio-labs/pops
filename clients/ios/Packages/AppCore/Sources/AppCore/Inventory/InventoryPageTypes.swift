import Foundation

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
