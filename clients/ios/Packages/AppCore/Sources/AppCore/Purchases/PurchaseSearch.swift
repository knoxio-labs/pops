import Foundation

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

/// The server-side settlement filter for purchase search.
public enum PurchaseSearchStatus: String, Hashable, Sendable {
    case any
    case unmatched
    case matched
    case partial
    case cash
    case ignored
}

/// A tag in use across purchase line items, as read from
/// ``PurchasesRepository/purchaseTags()``, ordered most-used first by the server.
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
