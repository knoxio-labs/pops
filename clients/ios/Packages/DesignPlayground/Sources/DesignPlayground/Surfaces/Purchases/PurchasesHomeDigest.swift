import AppCore
import Foundation

/// Every figure the purchases home draws, derived once from the rows that
/// have loaded.
///
/// `GET /mobile/purchases` is the only read there is, so the figure, the
/// unmatched count, where the money went and Recent all come from one answer
/// and arrive together. That is why the home loads as one skeleton rather
/// than band by band: there is nothing for a band to wait on that the others
/// do not.
@MainActor
internal struct PurchasesHomeDigest {
    /// One merchant's line in Where it went.
    internal struct Leader: Identifiable, Equatable {
        internal let name: String
        internal let total: MoneyAmount
        internal let purchases: Int
        /// The newest purchase at this merchant, drawn as its mark.
        internal let sample: Purchase

        internal var id: String { name }
    }

    /// How the month compares with the one before it, in its leading currency.
    internal struct Delta: Equatable {
        internal let amount: MoneyAmount
        internal let isUp: Bool
        internal let against: Date
    }

    internal let purchases: [Purchase]
    internal let month: Date?
    /// The month's spend per currency, largest first and never summed.
    internal let totals: [MoneyAmount]
    internal let monthCount: Int
    internal let delta: Delta?
    internal let unmatched: [Purchase]
    internal let leaders: [Leader]
    internal let recent: [Purchase]

    internal static let recentLimit = 4
    internal static let leaderLimit = 4

    internal init(_ purchases: [Purchase]) {
        self.purchases = purchases
        let months = PurchasesPresentation.byMonth(purchases)
        let latest = months.first
        month = latest?.month
        let inMonth = latest?.purchases ?? []
        totals = PurchasesPresentation.totals(inMonth)
        monthCount = inMonth.count
        let currency = totals.first?.currencyCode ?? Fixtures.aud
        if let latest,
            let previous = months.dropFirst().first,
            let change = PurchasesPresentation.delta(
                for: latest.month, in: months, currency: currency)
        {
            delta = Delta(amount: change.amount, isUp: change.isUp, against: previous.month)
        } else {
            delta = nil
        }
        unmatched = purchases.filter(\.status.isUnsettled)
        leaders = Self.leaders(inMonth, currency: currency)
        recent = Array(purchases.prefix(Self.recentLimit))
    }

    /// The history with a just-saved purchase placed where its date puts it,
    /// newest first, rather than on top.
    internal static func landing(_ arriving: Purchase, in purchases: [Purchase]) -> [Purchase] {
        (purchases.filter { $0.id != arriving.id } + [arriving])
            .sorted { $0.orderedOn > $1.orderedOn }
    }

    /// Where the month's money went: the same month the figure above it
    /// states, in its leading currency, largest first. Unattributed rows are
    /// left out, because "not recognised" is not a shop.
    private static func leaders(_ month: [Purchase], currency: String) -> [Leader] {
        var order: [String] = []
        var grouped: [String: [Purchase]] = [:]
        for purchase in month
        where purchase.total.currencyCode == currency
            && !PurchasesPresentation.isUnattributed(purchase)
        {
            let name = PurchasesPresentation.merchant(purchase)
            if grouped[name] == nil { order.append(name) }
            grouped[name, default: []].append(purchase)
        }
        return order.compactMap { name -> Leader? in
            guard let rows = grouped[name], let sample = rows.first else { return nil }
            let minor = rows.reduce(0) { $0 + $1.total.minorUnits }
            return Leader(
                name: name,
                total: MoneyAmount(minorUnits: minor, currencyCode: currency),
                purchases: rows.count,
                sample: sample)
        }
        .sorted { $0.total.minorUnits > $1.total.minorUnits }
        .prefix(leaderLimit)
        .map { $0 }
    }
}
