import Foundation

/// Where a purchase stands against the money that paid for it.
///
/// The mobile surface sends this as a bare string rather than an enumeration,
/// deliberately: a status added to the purchases pillar would otherwise turn
/// every handset older than that deploy into a contract mismatch, and a list
/// that refuses to draw is a worse answer than a row whose badge says nothing.
/// ``unrecognised`` is that openness made explicit rather than left implicit in
/// a `String`.
public enum PurchaseSettlement: Hashable, Sendable {
    /// Nothing in finance explains this purchase yet.
    case awaitingSettlement
    /// A finance transaction accounts for it.
    case linked
    /// Some of it is accounted for and some is not.
    case partial
    /// Paid in cash, so no transaction will ever explain it. A terminal state,
    /// not a pending one.
    case settledCash
    /// Deliberately excluded from reconciliation.
    case ignored
    /// A status this build has never heard of, kept verbatim.
    case unrecognised(String)

    public init(wire: String) {
        switch wire {
        case "awaiting_settlement": self = .awaitingSettlement
        case "linked": self = .linked
        case "partial": self = .partial
        case "settled_cash": self = .settledCash
        case "ignored": self = .ignored
        default: self = .unrecognised(wire)
        }
    }

    /// Whether the purchase is still waiting on somebody. `settledCash` and
    /// `ignored` are settled answers rather than pending ones, and an
    /// unrecognised status is not claimed either way.
    public var isUnsettled: Bool {
        switch self {
        case .awaitingSettlement, .partial: true
        case .linked, .settledCash, .ignored, .unrecognised: false
        }
    }
}

/// One purchase in the mobile list.
public struct Purchase: Hashable, Sendable, Identifiable {
    public let id: String
    public let merchantName: String?
    public let orderedOn: Date
    public let total: MoneyAmount
    public let itemCount: Int
    public let receiptURI: String?
    public let status: PurchaseSettlement

    public init(
        id: String,
        merchantName: String?,
        orderedOn: Date,
        total: MoneyAmount,
        itemCount: Int,
        receiptURI: String?,
        status: PurchaseSettlement
    ) {
        self.id = id
        self.merchantName = merchantName
        self.orderedOn = orderedOn
        self.total = total
        self.itemCount = itemCount
        self.receiptURI = receiptURI
        self.status = status
    }
}

/// One cursor-paginated page of purchases.
public struct PurchasePage: Hashable, Sendable {
    public let purchases: [Purchase]
    public let nextCursor: String?

    public init(purchases: [Purchase], nextCursor: String?) {
        self.purchases = purchases
        self.nextCursor = nextCursor
    }
}
