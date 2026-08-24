import Foundation

/// One purchase in the mobile list.
public struct Purchase: Hashable, Sendable, Identifiable {
    public let id: String
    public let merchantName: String?
    public let orderedOn: Date
    public let total: MoneyAmount
    public let itemCount: Int
    public let receiptURI: String?

    public init(
        id: String,
        merchantName: String?,
        orderedOn: Date,
        total: MoneyAmount,
        itemCount: Int,
        receiptURI: String?
    ) {
        self.id = id
        self.merchantName = merchantName
        self.orderedOn = orderedOn
        self.total = total
        self.itemCount = itemCount
        self.receiptURI = receiptURI
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
