import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases home digest")
@MainActor
internal struct PurchasesHomeDigestTests {
    @Test("all count is the server count rather than the loaded row count")
    func usesServerAllCount() {
        let rows = [purchase("a", "Shop A", day: 4), purchase("b", "Shop B", day: 3)]

        let digest = PurchasesHomeDigest(
            recent: rows, allCount: 17, unmatched: rows, unmatchedCount: 12)

        #expect(digest.allCount == 17)
        #expect(digest.purchases.count == 2)
    }

    @Test("a zero server unmatched count empties loaded unmatched rows")
    func zeroUnmatchedCountIsEmpty() {
        let row = purchase("a", "Shop A", day: 4)

        let digest = PurchasesHomeDigest(
            recent: [row], allCount: 1, unmatched: [row], unmatchedCount: 0)

        #expect(digest.unmatchedCount == 0)
        #expect(digest.unmatched.isEmpty)
    }

    @Test("three landed purchases are placed by purchase date")
    func landingPlacesSeveralRows() {
        let existing = [purchase("existing", "Existing", day: 2)]
        let arriving = [
            purchase("oldest", "Oldest", day: 1),
            purchase("newest", "Newest", day: 5),
            purchase("middle", "Middle", day: 3),
        ]

        let landed = PurchasesHomeDigest.landing(arriving, in: existing)

        #expect(landed.map(\.id) == ["newest", "middle", "existing", "oldest"])
    }

    @Test("leaders omit unattributed rows and currencies outside the leading total")
    func leadersStayWithinTheLeadingCurrency() {
        let rows = [
            purchase("aud", "AUD Shop", day: 5, minorUnits: 900),
            purchase("usd", "USD Shop", day: 4, minorUnits: 800, currency: "USD"),
            Purchase.fake(
                id: "unknown",
                merchant: .unattributed,
                orderedOn: date(day: 3),
                total: money(700, "AUD")),
        ]

        let digest = PurchasesHomeDigest(
            recent: rows, allCount: 3, unmatched: rows, unmatchedCount: 3)

        #expect(digest.leaders.map(\.name) == ["AUD Shop"])
        #expect(digest.leaders.first?.total == money(900, "AUD"))
    }

    @Test("one month of history has no delta")
    func oneMonthHasNoDelta() {
        let rows = [purchase("a", "Shop A", day: 5), purchase("b", "Shop B", day: 3)]

        let digest = PurchasesHomeDigest(
            recent: rows, allCount: 2, unmatched: rows, unmatchedCount: 2)

        #expect(digest.delta == nil)
    }

    @Test("a server summary supplies separate totals, counts, delta and aggregate leaders")
    func acceptsMonthSummary() throws {
        let summary = PurchasesMonthSummary(
            totals: [
                currencyTotal(total: 2_000, net: 1_900, currency: "AUD", orders: 6),
                currencyTotal(total: 900, net: 850, currency: "USD", orders: 2),
            ],
            purchaseCount: 8,
            previousMonthTotals: [
                currencyTotal(total: 1_500, net: 1_450, currency: "AUD", orders: 4)
            ],
            unmatchedCount: 3,
            merchantLeaders: [
                PurchasesMerchantLeader(
                    merchantName: "Shop A", netSpend: money(1_200, "AUD"), orderCount: 4),
                PurchasesMerchantLeader(
                    merchantName: nil, netSpend: money(500, "AUD"), orderCount: 1),
                PurchasesMerchantLeader(
                    merchantName: "US Shop", netSpend: money(850, "USD"), orderCount: 2),
            ])
        let month = date(day: 1)

        let digest = PurchasesHomeDigest(
            recent: [], allCount: 20, unmatched: [], unmatchedCount: 41, month: month,
            summary: summary)

        #expect(digest.totals == [money(2_000, "AUD"), money(900, "USD")])
        #expect(digest.monthCount == 8)
        // The tile counts the whole unsettled backlog it opens, not the month's 3.
        #expect(digest.unmatchedCount == 41)
        #expect(
            digest.leaders == [
                PurchasesHomeDigest.Leader(
                    name: "Shop A", total: money(1_200, "AUD"), purchases: 4)
            ])
        let delta = try #require(digest.delta)
        #expect(delta.amount == money(500, "AUD"))
        #expect(delta.isUp)
    }

    private func purchase(
        _ id: String,
        _ merchant: String,
        day: Int,
        minorUnits: Int = 500,
        currency: String = "AUD"
    ) -> Purchase {
        .fake(
            id: id,
            merchant: .printed(merchant),
            orderedOn: date(day: day),
            total: money(minorUnits, currency))
    }

    private func date(day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        guard
            let result = calendar.date(
                from: DateComponents(year: 2026, month: 8, day: day, hour: 12)
            )
        else { fatalError("Invalid test date") }
        return result
    }

    private func money(_ minorUnits: Int, _ currency: String) -> MoneyAmount {
        MoneyAmount(minorUnits: minorUnits, currencyCode: currency)
    }

    private func currencyTotal(
        total: Int,
        net: Int,
        currency: String,
        orders: Int
    ) -> PurchasesCurrencyTotal {
        PurchasesCurrencyTotal(
            total: money(total, currency),
            netSpend: money(net, currency),
            orderCount: orders)
    }
}
