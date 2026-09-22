/// Aggregate purchase amounts for one currency in a calendar month.
public struct PurchasesCurrencyTotal: Hashable, Sendable {
    public let total: MoneyAmount
    public let netSpend: MoneyAmount
    public let orderCount: Int

    public init(total: MoneyAmount, netSpend: MoneyAmount, orderCount: Int) {
        self.total = total
        self.netSpend = netSpend
        self.orderCount = orderCount
    }
}

/// One merchant's aggregate contribution to a monthly purchase summary.
public struct PurchasesMerchantLeader: Hashable, Sendable {
    /// The merchant name when the purchases pillar could attribute one.
    public let merchantName: String?
    public let netSpend: MoneyAmount
    public let orderCount: Int

    public init(merchantName: String?, netSpend: MoneyAmount, orderCount: Int) {
        self.merchantName = merchantName
        self.netSpend = netSpend
        self.orderCount = orderCount
    }
}

/// Purchase aggregates for a requested calendar month.
public struct PurchasesMonthSummary: Hashable, Sendable {
    public let totals: [PurchasesCurrencyTotal]
    public let purchaseCount: Int
    /// The preceding month's totals, or `nil` when no comparison month exists.
    public let previousMonthTotals: [PurchasesCurrencyTotal]?
    public let unmatchedCount: Int
    public let merchantLeaders: [PurchasesMerchantLeader]

    public init(
        totals: [PurchasesCurrencyTotal],
        purchaseCount: Int,
        previousMonthTotals: [PurchasesCurrencyTotal]?,
        unmatchedCount: Int,
        merchantLeaders: [PurchasesMerchantLeader]
    ) {
        self.totals = totals
        self.purchaseCount = purchaseCount
        self.previousMonthTotals = previousMonthTotals
        self.unmatchedCount = unmatchedCount
        self.merchantLeaders = merchantLeaders
    }

    /// A summary with no purchases or comparison month, suitable for empty fakes.
    public static let empty = PurchasesMonthSummary(
        totals: [],
        purchaseCount: 0,
        previousMonthTotals: nil,
        unmatchedCount: 0,
        merchantLeaders: []
    )
}
