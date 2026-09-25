import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase detail presentation")
@MainActor
internal struct PurchaseDetailPresentationTests {
    @Test("a subtotal-only purchase has no totals foot")
    func noFootWithoutAdjustments() {
        #expect(PurchaseDetailTotals.rows(for: detail()).isEmpty)
    }

    @Test("only a discount produces subtotal, discount, and total in order")
    func discountOnlyFoot() throws {
        let rows = PurchaseDetailTotals.rows(
            for: detail(discount: money(250), total: money(750)))

        #expect(rows.map(\.label) == ["Subtotal", "Discount", "Total"])
        #expect(try #require(rows.first { $0.label == "Discount" }).amount.hasPrefix("−"))
        #expect(rows.filter(\.isTotal).map(\.label) == ["Total"])
    }

    @Test("all adjustments appear between subtotal and total")
    func allAdjustments() {
        let rows = PurchaseDetailTotals.rows(
            for: detail(
                tax: money(100), shipping: money(200), discount: money(50),
                surcharge: money(25), total: money(1_275)))

        #expect(
            rows.map(\.label)
                == ["Subtotal", "Tax", "Delivery", "Surcharge", "Discount", "Total"])
    }

    @Test("quantity copy distinguishes one, divisible repeats, and indivisible repeats")
    func quantityCopy() throws {
        #expect(PurchaseDetailLineText.quantity(line(quantity: 1, cents: 1_000)) == nil)
        let divisible = try #require(
            PurchaseDetailLineText.quantity(line(quantity: 2, cents: 2_850)))
        #expect(divisible.hasPrefix("2 × "))
        #expect(divisible.contains("14.25"))
        #expect(PurchaseDetailLineText.quantity(line(quantity: 3, cents: 1_000)) == "Qty 3")
    }

    @Test("newlines in a till line become separators")
    func oneLine() {
        #expect(
            PurchaseDetailLineText.oneLine("3129-1-PP\n C&H Fruits Drops*")
                == "3129-1-PP · C&H Fruits Drops*")
    }

    @Test("the locale's own currency has no suffix")
    func homeCurrency() {
        let australia = Locale(identifier: "en_AU")
        #expect(PurchaseDetailCopy.foreignCurrency(money(100), locale: australia) == nil)
        #expect(
            PurchaseDetailCopy.foreignCurrency(
                MoneyAmount(minorUnits: 100, currencyCode: "USD"), locale: australia)
                == "USD")
    }

    @Test("equal till wording ignores case and diacritics")
    func equalPrintedWording() {
        #expect(
            PurchaseDetailCopy.printed(
                .entity(id: "merchant", name: "Café Aldi", printed: "CAFE ALDI")) == nil)
        #expect(
            PurchaseDetailCopy.printed(
                .entity(id: "merchant", name: "Aldi", printed: "ALDI STORES"))
                == "ALDI STORES")
    }

    @Test("every settlement has distinct match copy and symbol")
    func settlementCopyIsDistinct() {
        let statuses: [PurchaseSettlement] = [
            .awaitingSettlement, .linked, .partial, .settledCash, .ignored, .nothingToSettle,
            .unrecognised("refunded"),
        ]

        #expect(Set(statuses.map(PurchaseDetailCopy.match)).count == statuses.count)
        #expect(Set(statuses.map(PurchaseDetailCopy.matchSymbol)).count == statuses.count)
        #expect(PurchaseDetailCopy.match(for: .unrecognised("refunded")) == "Refunded")
    }

    @Test("receipt labels distinguish one page from several")
    func receiptLabels() {
        #expect(PurchaseDetailCopy.receiptLabel(pages: 1) == "Receipt")
        #expect(PurchaseDetailCopy.receiptLabel(pages: 3) == "Receipt, 3 pages")
    }

    @Test("every refresh failure has exact retained-content copy")
    func refreshFailureCopy() {
        let failures: [PurchaseDetailFailure] = [
            .offline, .unreachable, .notFound, .unauthorized, .contractMismatch,
        ]
        let notices = failures.map(PurchaseDetailCopy.refreshNotice)

        #expect(
            notices == [
                "Offline, showing the saved copy",
                "Couldn't refresh",
                "Deleted elsewhere",
                "No longer allowed to refresh",
                "Update Pops to refresh",
            ])
        #expect(Set(notices).count == failures.count)
    }

    @Test("the edited label uses the reader's requested calendar presentation")
    func editedDate() throws {
        let utc = try #require(TimeZone(secondsFromGMT: 0))
        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.timeZone = utc
        components.year = 2026
        components.month = 3
        components.day = 6
        let date = try #require(components.date)

        #expect(
            PurchaseDetailCopy.edited(date, locale: Locale(identifier: "en_AU"), timeZone: utc)
                == "Edited 6 Mar")
    }

    @Test("share copy keeps header and receipt lines in reading order")
    func shareCopy() {
        let detail = PurchaseDetail.fake(
            purchase: .fake(merchant: .printed("Corner Shop"), total: money(1_250)),
            lines: [
                .fake(id: "first", name: "Tea\n bags", lineTotal: money(500)),
                .fake(id: "second", name: "Milk", lineTotal: money(750)),
            ])

        let text = PurchaseDetailCopy.shareText(detail)
        let parts = text.components(separatedBy: "\n")

        #expect(parts[0] == "Corner Shop")
        #expect(parts[1] == PurchaseDetailCopy.day(detail.purchase.orderedOn))
        #expect(parts[2] == detail.purchase.total.formatted())
        #expect(parts[3].isEmpty)
        #expect(parts[4] == "Tea · bags  \(detail.lines[0].lineTotal.formatted())")
        #expect(parts[5] == "Milk  \(detail.lines[1].lineTotal.formatted())")
    }

    @Test("a purchase without item lines shares no empty item section")
    func shareCopyWithoutLines() {
        let detail = PurchaseDetail.fake(
            purchase: .fake(merchant: .printed("Corner Shop"), total: money(1_250)),
            lines: [])

        let parts = PurchaseDetailCopy.shareText(detail).components(separatedBy: "\n")
        let containsBlankLine = parts.contains { $0.isEmpty }

        #expect(parts.count == 3)
        #expect(!containsBlankLine)
    }

    private func detail(
        tax: MoneyAmount = money(0),
        shipping: MoneyAmount = money(0),
        discount: MoneyAmount = money(0),
        surcharge: MoneyAmount = money(0),
        total: MoneyAmount = money(1_000)
    ) -> PurchaseDetail {
        .fake(
            purchase: .fake(total: total), subtotal: money(1_000), tax: tax,
            shipping: shipping, discount: discount, surcharge: surcharge)
    }

    private func line(quantity: Int, cents: Int) -> PurchaseDetailLine {
        .fake(quantity: quantity, lineTotal: money(cents))
    }

    private static func money(_ cents: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: cents, currencyCode: "AUD")
    }

    private func money(_ cents: Int) -> MoneyAmount { Self.money(cents) }
}
