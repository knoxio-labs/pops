import AppCore
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase search row")
internal struct PurchaseSearchRowTests {
    @Test("a purchase hit's route is its own order id")
    func purchaseHitRoutesToItsOrder() {
        let hit = PurchaseSearchHit.purchase(.fake(id: "order-1"), printedMatch: nil)

        #expect(PurchaseSearchRowContent.route(for: hit) == .detail("order-1"))
    }

    @Test("a line hit's route is its order's id, not the line's")
    func lineHitRoutesToItsOrderNotItself() {
        let hit = PurchaseSearchHit.line(
            id: "line-9",
            name: "Milk",
            quantity: 1,
            lineTotal: MoneyAmount(minorUnits: 250, currencyCode: "AUD"),
            order: .fake(id: "order-2"),
            tagMatch: nil)

        #expect(PurchaseSearchRowContent.route(for: hit) == .detail("order-2"))
        #expect(PurchaseSearchRowContent.route(for: hit) != .detail("line-9"))
    }

    @Test("a purchase hit's detail line names the order's day")
    func purchaseDetailTextIsTheDay() {
        let order = PurchaseSearchOrder.fake(orderedOn: Date(timeIntervalSince1970: 0))
        let hit = PurchaseSearchHit.purchase(order, printedMatch: nil)

        #expect(PurchaseSearchRowContent.detailText(for: hit) == "1 Jan")
    }

    @Test("a line hit's detail line carries its quantity and its order's merchant and day")
    func lineDetailTextCarriesQuantityMerchantAndDay() {
        let order = PurchaseSearchOrder.fake(
            merchant: .printed("Fake Store"), orderedOn: Date(timeIntervalSince1970: 0))
        let hit = PurchaseSearchHit.line(
            id: "line-1",
            name: "Milk",
            quantity: 3,
            lineTotal: MoneyAmount(minorUnits: 250, currencyCode: "AUD"),
            order: order,
            tagMatch: nil)

        #expect(PurchaseSearchRowContent.detailText(for: hit) == "×3 · Fake Store · 1 Jan")
    }

    @Test("a purchase and a line hit render different detail line text")
    func detailTextDiffersBetweenPurchaseAndLine() {
        let order = PurchaseSearchOrder.fake(orderedOn: Date(timeIntervalSince1970: 0))
        let purchaseHit = PurchaseSearchHit.purchase(order, printedMatch: nil)
        let lineHit = PurchaseSearchHit.line(
            id: "line-1",
            name: "Milk",
            quantity: 1,
            lineTotal: MoneyAmount(minorUnits: 250, currencyCode: "AUD"),
            order: order,
            tagMatch: nil)

        let purchaseText = PurchaseSearchRowContent.detailText(for: purchaseHit)
        let lineText = PurchaseSearchRowContent.detailText(for: lineHit)

        #expect(purchaseText != lineText)
    }

    @Test("a three-line till name renders as one line")
    func threeLineTillNameCollapsesToOneLine() {
        let name = "Whole Milk\n2 Litre\nFull Cream"

        #expect(PurchaseSearchRowContent.oneLine(name) == "Whole Milk · 2 Litre · Full Cream")
    }

    @Test("a one-line till name is unchanged")
    func oneLineTillNamePassesThrough() {
        #expect(PurchaseSearchRowContent.oneLine("Milk") == "Milk")
    }

    @Test("a line hit's name folds its till name to one line")
    func lineHitNameFoldsTillNameToOneLine() {
        let hit = PurchaseSearchHit.line(
            id: "line-1",
            name: "Whole Milk\n2 Litre\nFull Cream",
            quantity: 1,
            lineTotal: MoneyAmount(minorUnits: 250, currencyCode: "AUD"),
            order: .fake(),
            tagMatch: nil)

        #expect(PurchaseSearchRowContent.name(for: hit) == "Whole Milk · 2 Litre · Full Cream")
    }

    @Test("a purchase hit's name is its merchant's display name")
    func purchaseHitNameIsMerchantDisplayName() {
        let hit = PurchaseSearchHit.purchase(
            .fake(merchant: .printed("Fake Store")), printedMatch: nil)

        #expect(PurchaseSearchRowContent.name(for: hit) == "Fake Store")
    }

    @Test("an empty query matches nothing")
    func emptyQueryHasNoMatchRanges() {
        #expect(PurchaseSearchRowContent.matchRanges(of: "", in: "Milk").isEmpty)
    }

    @Test("a query matches case-insensitively, once per occurrence")
    func queryMatchesCaseInsensitivelyPerOccurrence() {
        let ranges = PurchaseSearchRowContent.matchRanges(of: "milk", in: "Milk and milkshake")

        #expect(ranges.count == 2)
    }
}

extension PurchaseSearchOrder {
    fileprivate static func fake(
        id: String = "order-1",
        merchant: MerchantIdentity = .printed("Fake Store"),
        orderedOn: Date = Date(timeIntervalSince1970: 0),
        total: MoneyAmount = MoneyAmount(minorUnits: 1999, currencyCode: "AUD"),
        status: PurchaseSettlement = .awaitingSettlement
    ) -> PurchaseSearchOrder {
        PurchaseSearchOrder(
            id: id, merchant: merchant, orderedOn: orderedOn, total: total, status: status)
    }
}
