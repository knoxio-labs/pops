import AppCore
import Foundation

@MainActor
internal struct PurchasesHomeDigest {
    internal struct Leader: Identifiable, Equatable {
        internal let name: String
        internal let total: MoneyAmount
        internal let purchases: Int

        internal var id: String { name }
    }

    internal struct Delta: Equatable {
        internal let amount: MoneyAmount
        internal let isUp: Bool
        internal let against: Date
    }

    internal let purchases: [Purchase]
    internal let allCount: Int
    internal let month: Date?
    internal let totals: [MoneyAmount]
    internal let monthCount: Int
    internal let delta: Delta?
    internal let unmatched: [Purchase]
    internal let unmatchedCount: Int
    internal let leaders: [Leader]
    internal let recent: [Purchase]

    internal static let recentLimit = 4
    internal static let leaderLimit = 4

    internal init(
        recent: [Purchase],
        allCount: Int,
        unmatched: [Purchase],
        unmatchedCount: Int
    ) {
        purchases = recent
        self.allCount = allCount
        let months = PurchasesPresentation.byMonth(recent)
        let latest = months.first
        month = latest?.month
        let inMonth = latest?.purchases ?? []
        totals = PurchasesPresentation.totals(inMonth)
        monthCount = inMonth.count
        let currency = totals.first?.currencyCode
        delta = Self.delta(latest: latest, months: months, currency: currency)
        self.unmatched = unmatchedCount == 0 ? [] : unmatched.filter(\.status.isUnsettled)
        self.unmatchedCount = unmatchedCount
        leaders = Self.leaders(inMonth, currency: currency)
        self.recent = Array(recent.prefix(Self.recentLimit))
    }

    internal init(
        recent: [Purchase],
        allCount: Int,
        unmatched: [Purchase],
        month: Date,
        summary: PurchasesMonthSummary
    ) {
        purchases = recent
        self.allCount = allCount
        self.month = month
        totals = summary.totals.map(\.total).sorted(by: Self.amountsDescending)
        monthCount = summary.purchaseCount
        delta = Self.delta(month: month, summary: summary, currency: totals.first?.currencyCode)
        self.unmatched = summary.unmatchedCount == 0 ? [] : unmatched.filter(\.status.isUnsettled)
        unmatchedCount = summary.unmatchedCount
        leaders = Self.leaders(summary.merchantLeaders, currency: totals.first?.currencyCode)
        self.recent = Array(recent.prefix(Self.recentLimit))
    }

    internal static func landing(_ arriving: [Purchase], in purchases: [Purchase]) -> [Purchase] {
        let arrivingIDs = Set(arriving.map(\.id))
        return (purchases.filter { !arrivingIDs.contains($0.id) } + arriving)
            .sorted { $0.orderedOn > $1.orderedOn }
    }

    private static func delta(
        latest: (month: Date, purchases: [Purchase])?,
        months: [(month: Date, purchases: [Purchase])],
        currency: String?
    ) -> Delta? {
        guard let latest, let currency, let previous = months.dropFirst().first,
            let change = PurchasesPresentation.delta(
                for: latest.month, in: months, currency: currency)
        else { return nil }
        return Delta(amount: change.amount, isUp: change.isUp, against: previous.month)
    }

    private static func delta(
        month: Date,
        summary: PurchasesMonthSummary,
        currency: String?
    ) -> Delta? {
        guard let currency,
            let current = summary.totals.first(where: { $0.total.currencyCode == currency }),
            let previous = summary.previousMonthTotals?.first(where: {
                $0.total.currencyCode == currency
            }),
            previous.total.minorUnits != 0,
            let previousMonth = Calendar.current.date(byAdding: .month, value: -1, to: month)
        else { return nil }
        return Delta(
            amount: MoneyAmount(
                minorUnits: abs(current.total.minorUnits - previous.total.minorUnits),
                currencyCode: currency),
            isUp: current.total.minorUnits > previous.total.minorUnits,
            against: previousMonth)
    }

    private static func leaders(_ month: [Purchase], currency: String?) -> [Leader] {
        guard let currency else { return [] }
        var grouped: [String: [Purchase]] = [:]
        for purchase in month
        where purchase.total.currencyCode == currency
            && !PurchasesPresentation.isUnattributed(purchase)
        {
            grouped[PurchasesPresentation.merchant(purchase), default: []].append(purchase)
        }
        return grouped.map { name, rows in
            Leader(
                name: name,
                total: MoneyAmount(
                    minorUnits: rows.reduce(0) { $0 + $1.total.minorUnits },
                    currencyCode: currency),
                purchases: rows.count)
        }
        .sorted { amountsDescending($0.total, $1.total) }
        .prefix(leaderLimit)
        .map { $0 }
    }

    private static func leaders(
        _ leaders: [PurchasesMerchantLeader], currency: String?
    ) -> [Leader] {
        guard let currency else { return [] }
        return leaders.compactMap { leader in
            guard leader.netSpend.currencyCode == currency,
                let name = leader.merchantName?.trimmingCharacters(in: .whitespacesAndNewlines),
                !name.isEmpty
            else { return nil }
            return Leader(name: name, total: leader.netSpend, purchases: leader.orderCount)
        }
        .sorted { amountsDescending($0.total, $1.total) }
        .prefix(leaderLimit)
        .map { $0 }
    }

    private static func amountsDescending(_ lhs: MoneyAmount, _ rhs: MoneyAmount) -> Bool {
        if lhs.minorUnits != rhs.minorUnits { return lhs.minorUnits > rhs.minorUnits }
        return lhs.currencyCode < rhs.currencyCode
    }
}
