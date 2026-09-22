import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases presentation")
@MainActor
internal struct PurchasesPresentationTests {
    @Test("calendar months are newest first while rows keep their input order")
    func groupsByMonth() {
        let januaryFirst = Purchase.fake(id: "jan-first", orderedOn: day(2026, 1, 28))
        let march = Purchase.fake(id: "march", orderedOn: day(2026, 3, 2))
        let januarySecond = Purchase.fake(id: "jan-second", orderedOn: day(2026, 1, 3))
        let february = Purchase.fake(id: "february", orderedOn: day(2026, 2, 8))

        let months = PurchasesPresentation.byMonth([
            januaryFirst, march, januarySecond, february,
        ])

        #expect(months.map { Calendar.current.component(.month, from: $0.month) } == [3, 2, 1])
        #expect(months.last?.purchases.map(\.id) == ["jan-first", "jan-second"])
    }

    @Test("currency totals remain separate")
    func totalsKeepCurrenciesSeparate() {
        let totals = PurchasesPresentation.totals([
            .fake(total: money(800, "AUD")),
            .fake(id: "usd", total: money(700, "USD")),
            .fake(id: "aud-2", total: money(600, "AUD")),
        ])

        #expect(totals == [money(1_400, "AUD"), money(700, "USD")])
    }

    @Test("delta needs an earlier nonzero month")
    func deltaBoundaries() throws {
        let currentMonth = day(2026, 3, 1)
        let previousMonth = day(2026, 2, 1)
        let current = Purchase.fake(orderedOn: currentMonth, total: money(900, "AUD"))
        let zero = Purchase.fake(
            id: "zero", orderedOn: previousMonth, total: money(0, "AUD"))

        #expect(
            PurchasesPresentation.delta(
                for: currentMonth,
                in: [(month: currentMonth, purchases: [current])],
                currency: "AUD") == nil)
        #expect(
            PurchasesPresentation.delta(
                for: currentMonth,
                in: [
                    (month: currentMonth, purchases: [current]),
                    (month: previousMonth, purchases: [zero]),
                ],
                currency: "AUD") == nil)
    }

    @Test("only an unattributed merchant is unattributed")
    func unattributedIdentity() {
        #expect(PurchasesPresentation.isUnattributed(.fake(merchant: .unattributed)))
        #expect(!PurchasesPresentation.isUnattributed(.fake(merchant: .printed("Shop"))))
        #expect(
            !PurchasesPresentation.isUnattributed(
                .fake(merchant: .entity(id: "merchant", name: "Shop", printed: "SHOP"))))
    }

    @Test("pending and linked settlements have distinct tones")
    func settlementTonesDiffer() {
        #expect(
            PurchasesPresentation.tone(for: .awaitingSettlement)
                != PurchasesPresentation.tone(for: .linked))
    }

    @Test("an unknown status keeps its raw label")
    func unknownStatusLabel() {
        #expect(PurchasesPresentation.label(for: .unrecognised("refunded")) == "refunded")
    }

    private func day(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        guard
            let result = calendar.date(
                from: DateComponents(year: year, month: month, day: day, hour: 12)
            )
        else { fatalError("Invalid test date") }
        return result
    }

    private func money(_ minorUnits: Int, _ currency: String) -> MoneyAmount {
        MoneyAmount(minorUnits: minorUnits, currencyCode: currency)
    }
}
