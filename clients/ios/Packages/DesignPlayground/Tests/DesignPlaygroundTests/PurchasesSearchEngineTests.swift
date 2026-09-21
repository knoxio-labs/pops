import AppCore
import Foundation
import Testing

@testable import DesignPlayground

@Suite("Purchases search engine")
internal struct PurchasesSearchEngineTests {
    private func purchase(
        _ id: String, _ merchant: MerchantIdentity, status: PurchaseSettlement = .awaitingSettlement
    ) -> Purchase {
        Purchase(
            id: id, merchant: merchant, orderedOn: Date(timeIntervalSince1970: 0),
            total: MoneyAmount(minorUnits: 1_000, currencyCode: "AUD"), itemCount: 1,
            receiptURI: nil, status: status)
    }

    private func line(_ id: String, _ order: String, _ name: String, tags: [String] = [])
        -> PurchaseItemHit
    {
        PurchaseItemHit(
            id: id, purchaseID: order, name: name, quantity: 1,
            lineTotal: MoneyAmount(minorUnits: 100, currencyCode: "AUD"), tags: tags)
    }

    private var bunnings: Purchase {
        purchase(
            "bunnings",
            .entity(id: "e", name: "Bunnings", printed: "BUNNINGS WAREHOUSE ALEXANDRIA"))
    }

    @Test("an empty or blank query matches nothing")
    func blankQuery() {
        let hits = PurchasesSearchEngine.search("  ", purchases: [bunnings], lines: [])
        #expect(hits.isEmpty)
    }

    @Test("the entity name matches without a badge, the till's wording matches with one")
    func bothMerchantNames() {
        let byName = PurchasesSearchEngine.search("bunn", purchases: [bunnings], lines: [])
        let byPrinted = PurchasesSearchEngine.search("alexandria", purchases: [bunnings], lines: [])
        #expect(byName == [.purchase(bunnings, printed: nil)])
        #expect(byPrinted == [.purchase(bunnings, printed: "BUNNINGS WAREHOUSE ALEXANDRIA")])
    }

    @Test("a printed-only merchant matches as itself, and no merchant never matches")
    func printedAndUnattributed() {
        let tongli = purchase("tongli", .printed("TONGLI SUPERMARKET"))
        let nobody = purchase("nobody", .unattributed)
        let hits = PurchasesSearchEngine.search("tong", purchases: [tongli, nobody], lines: [])
        #expect(hits == [.purchase(tongli, printed: nil)])
        #expect(PurchasesSearchEngine.search("a", purchases: [nobody], lines: []).isEmpty)
    }

    @Test("a line matches on its name, or on a tag it then names, and carries its order")
    func lines() {
        let drill = line("drill", "bunnings", "OZITO DRILL", tags: ["tool"])
        let byName = PurchasesSearchEngine.search("ozito", purchases: [bunnings], lines: [drill])
        let byTag = PurchasesSearchEngine.search("too", purchases: [bunnings], lines: [drill])
        #expect(byName == [.line(drill, order: bunnings, tag: nil)])
        #expect(byTag == [.line(drill, order: bunnings, tag: "tool")])
    }

    @Test("a line whose order is not in the answer is dropped")
    func orphanLine() {
        let stray = line("stray", "missing", "OZITO DRILL")
        #expect(PurchasesSearchEngine.search("drill", purchases: [bunnings], lines: [stray]).isEmpty)
    }

    @Test("a name starting with the query ranks above one containing it, then other facets")
    func ranking() {
        let byTag = line("tagged", "bunnings", "MAKITA DRIVER", tags: ["tool"])
        let containing = line("contains", "bunnings", "BIG TOOL BAG")
        let prefix = line("prefix", "bunnings", "TOOLBOX")
        let hits = PurchasesSearchEngine.search(
            "tool", purchases: [bunnings], lines: [byTag, containing, prefix])
        #expect(hits.map(\.id) == ["line-prefix", "line-contains", "line-tagged"])
    }

    @Test("the kind filter keeps only purchases or only lines")
    func kindFilter() {
        let screws = line("screws", "bunnings", "BUNNINGS SCREWS")
        var filter = PurchasesSearchFilter(kind: .purchases)
        let purchasesOnly = PurchasesSearchEngine.search(
            "bunnings", purchases: [bunnings], lines: [screws], filter: filter)
        filter.kind = .lines
        let linesOnly = PurchasesSearchEngine.search(
            "bunnings", purchases: [bunnings], lines: [screws], filter: filter)
        #expect(purchasesOnly.map(\.id) == ["purchase-bunnings"])
        #expect(linesOnly.map(\.id) == ["line-screws"])
    }

    @Test("the status filter judges a line by its order's status")
    func statusFilter() {
        let matched = purchase("matched", .printed("ALDI"), status: .linked)
        let milk = line("milk", "matched", "ALDI MILK")
        let filter = PurchasesSearchFilter(status: .unmatched)
        let hits = PurchasesSearchEngine.search(
            "aldi", purchases: [matched], lines: [milk], filter: filter)
        #expect(hits.isEmpty)
        #expect(PurchasesStatusFilter.matched.matches(.linked))
        #expect(!PurchasesStatusFilter.matched.matches(.unrecognised("refunded")))
    }

    @Test("a till's multi-line name reads as one line")
    func oneLine() {
        #expect(PurchasesSearchEngine.oneLine("YUA001\n Home Decor \nPrice: open")
            == "YUA001 · Home Decor · Price: open")
    }
}
