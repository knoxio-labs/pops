import AppCore
import Foundation
import Testing

@testable import DesignPlayground

/// What the purchase detail prints: the receipt's foot, the quantity under a
/// line, the till's wording under a name, and the currency beside a total.
@Suite("Reading a saved purchase")
@MainActor
internal struct PurchaseDetailPresentationTests {
    private static let staged: [DesignPlayground.PurchaseDetail] = [
        PurchaseDetailFixtures.bunnings, PurchaseDetailFixtures.bunningsEdited,
        PurchaseDetailFixtures.aldi, PurchaseDetailFixtures.salvos,
        PurchaseDetailFixtures.uniqlo, PurchaseDetailFixtures.sushiNoLines,
        PurchaseDetailFixtures.unattributed, PurchaseDetailFixtures.cash,
        PurchaseDetailFixtures.foreign,
    ]

    @Test("every staged purchase's figures add up to its total, and its lines to its subtotal")
    func stagedFiguresReconcile() {
        for detail in Self.staged {
            let sum =
                detail.subtotal.minorUnits + detail.tax.minorUnits + detail.shipping.minorUnits
                + detail.surcharge.minorUnits - detail.discount.minorUnits
            #expect(sum == detail.purchase.total.minorUnits, "\(detail.id)")
            if !detail.lines.isEmpty {
                let lines = detail.lines.reduce(0) { $0 + $1.lineTotal.minorUnits }
                #expect(lines == detail.subtotal.minorUnits, "\(detail.id)")
            }
        }
    }

    @Test("a purchase whose items are its whole total has no foot")
    func noFootWithoutAdjustments() {
        #expect(PurchaseDetailTotals.rows(for: PurchaseDetailFixtures.aldi).isEmpty)
        #expect(PurchaseDetailTotals.rows(for: PurchaseDetailFixtures.sushiNoLines).isEmpty)
    }

    @Test("the foot runs subtotal, each adjustment present, then the total")
    func footOrder() {
        let rows = PurchaseDetailTotals.rows(for: PurchaseDetailFixtures.uniqlo)
        #expect(
            rows.map(\.label) == ["Subtotal", "Tax", "Delivery", "Surcharge", "Discount", "Total"])
        #expect(rows.filter(\.isTotal).map(\.label) == ["Total"])
        #expect(rows.first { $0.label == "Discount" }?.amount.hasPrefix("−") == true)

        let bunnings = PurchaseDetailTotals.rows(for: PurchaseDetailFixtures.bunnings)
        #expect(bunnings.map(\.label) == ["Subtotal", "Tax", "Total"])
    }

    @Test("a line bought once says nothing about quantity")
    func singleQuantity() {
        #expect(PurchaseDetailLineText.quantity(line(1, 540)) == nil)
    }

    @Test("a line bought more than once states the unit price only when it divides evenly")
    func repeatedQuantity() throws {
        let even = try #require(PurchaseDetailLineText.quantity(line(2, 2_850)))
        #expect(even.hasPrefix("2 × "))
        #expect(even.contains("14.25"))
        #expect(PurchaseDetailLineText.quantity(line(3, 1_000)) == "Qty 3")
    }

    @Test("a till line's newlines become separators")
    func oneLine() {
        #expect(
            PurchaseDetailLineText.oneLine("3129-1-PP\n C&H Fruits Drops*")
                == "3129-1-PP · C&H Fruits Drops*")
    }

    @Test("the till's wording shows only under a resolved name it differs from")
    func printedWording() {
        #expect(
            PurchaseDetailCopy.printed(.entity(id: "a", name: "ALDI", printed: "ALDI STORES"))
                == "ALDI STORES")
        #expect(PurchaseDetailCopy.printed(.entity(id: "a", name: "Aldi", printed: "ALDI")) == nil)
        #expect(PurchaseDetailCopy.printed(.printed("TONGLI SUPERMARKET")) == nil)
        #expect(PurchaseDetailCopy.printed(.unattributed) == nil)
    }

    @Test("a total in the reader's own currency carries no code, any other does")
    func foreignCurrency() {
        let australia = Locale(identifier: "en_AU")
        let aud = MoneyAmount(minorUnits: 100, currencyCode: "AUD")
        let usd = MoneyAmount(minorUnits: 100, currencyCode: "USD")
        #expect(PurchaseDetailCopy.foreignCurrency(aud, locale: australia) == nil)
        #expect(PurchaseDetailCopy.foreignCurrency(usd, locale: australia) == "USD")
    }

    @Test("a status this build does not know is shown as the pillar wrote it")
    func unrecognisedStatus() {
        #expect(PurchaseDetailCopy.match(for: .unrecognised("refunded")) == "Refunded")
        #expect(PurchaseDetailCopy.match(for: .awaitingSettlement) == "Awaiting a bank match")
    }

    private func line(_ quantity: Int, _ cents: Int) -> DesignPlayground.PurchaseDetailLine {
        DesignPlayground.PurchaseDetailLine(
            id: "l", name: "LINE", quantity: quantity, lineTotal: Fixtures.money(cents))
    }
}
