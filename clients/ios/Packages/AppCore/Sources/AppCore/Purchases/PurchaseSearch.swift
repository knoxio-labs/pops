import Foundation

/// The kinds of purchase search matches the caller wants to include.
public enum PurchaseSearchKind: Hashable, Sendable {
    /// Both purchase and line-item matches.
    case all
    /// Matches on purchase-level fields.
    case purchases
    /// Matches on line-item fields.
    case lines
}

/// The purchase-level context carried by every purchase search result.
public struct PurchaseSearchOrder: Hashable, Sendable {
    public let id: Purchase.ID
    public let merchant: MerchantIdentity
    public let orderedOn: Date
    public let total: MoneyAmount
    public let status: PurchaseSettlement

    /// Creates the order context for a search result.
    public init(
        id: Purchase.ID,
        merchant: MerchantIdentity,
        orderedOn: Date,
        total: MoneyAmount,
        status: PurchaseSettlement
    ) {
        self.id = id
        self.merchant = merchant
        self.orderedOn = orderedOn
        self.total = total
        self.status = status
    }
}

/// A purchase search result, preserving whether the order or one of its lines matched.
public enum PurchaseSearchHit: Hashable, Sendable, Identifiable {
    case purchase(PurchaseSearchOrder, printedMatch: String?)
    case line(
        id: String,
        name: String,
        quantity: Int,
        lineTotal: MoneyAmount,
        order: PurchaseSearchOrder,
        tagMatch: String?
    )

    /// A stable identity namespaced by result kind so an order and its line cannot collide.
    public var id: String {
        switch self {
        case .purchase(let order, _): "purchase:\(order.id)"
        case .line(let id, _, _, _, _, _): "line:\(id)"
        }
    }

    /// The order that owns the result.
    public var order: PurchaseSearchOrder {
        switch self {
        case .purchase(let order, _), .line(_, _, _, _, let order, _): order
        }
    }
}

/// One bounded page of purchase and line-item search matches.
public struct PurchaseSearchPage: Hashable, Sendable {
    /// The matching rows in server order.
    public let hits: [PurchaseSearchHit]
    /// The opaque cursor to request the following page, or `nil` when this is the last page.
    public let nextCursor: String?
    /// The number of all matching hits, when the server supplied it on the first page.
    public let totalCount: Int?

    /// Creates a search page.
    public init(hits: [PurchaseSearchHit], nextCursor: String?, totalCount: Int?) {
        self.hits = hits
        self.nextCursor = nextCursor
        self.totalCount = totalCount
    }
}

/// The server-side settlement filter for purchase search.
public enum PurchaseSearchStatus: String, Hashable, Sendable {
    case any
    case unmatched
    case matched
    case partial
    case cash
    case ignored
}

/// A tag in use across purchase line items, ordered most-used first by the server.
public struct PurchaseTagCount: Hashable, Sendable {
    public let tag: String
    /// How many lines carry the tag. The BFM route (POPS-4544) puts the
    /// count on the wire alongside the tag, so every producer supplies it.
    public let count: Int

    /// Creates a tag-in-use entry.
    public init(tag: String, count: Int) {
        self.tag = tag
        self.count = count
    }
}

/// One bounded page of tags in use across purchase line items.
public struct PurchaseTagPage: Hashable, Sendable {
    /// The matching tags in server order.
    public let tags: [PurchaseTagCount]
    /// The opaque cursor to request the following page, or `nil` when this is the last page.
    public let nextCursor: String?
    /// The number of all matching tags, when the server supplied it on the first page.
    public let totalCount: Int?

    /// Creates a page of purchase tags.
    public init(tags: [PurchaseTagCount], nextCursor: String?, totalCount: Int?) {
        self.tags = tags
        self.nextCursor = nextCursor
        self.totalCount = totalCount
    }
}
