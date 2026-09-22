import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("Purchase search")
internal struct PurchaseSearchTests {
    @Test("purchase and line identities cannot collide")
    func kindPrefixesIdentity() {
        let order = Self.order(id: "shared")
        let purchase = PurchaseSearchHit.purchase(order, printedMatch: nil)
        let line = PurchaseSearchHit.line(
            id: "shared",
            name: "Milk",
            quantity: 1,
            lineTotal: Self.money(500),
            order: order,
            tagMatch: nil)

        #expect(purchase.id == "purchase:shared")
        #expect(line.id == "line:shared")
        #expect(purchase.id != line.id)
    }

    @Test("line results preserve their order context")
    func linePreservesOrder() {
        let order = Self.order(id: "order-17", merchant: .printed("Corner Store"))
        let hit = PurchaseSearchHit.line(
            id: "line-3",
            name: "Bread",
            quantity: 2,
            lineTotal: Self.money(900),
            order: order,
            tagMatch: "grocery")

        #expect(hit.order == order)
    }

    @Test("fake search filters text across match fields without case sensitivity")
    func fakeFiltersText() async throws {
        let order = Self.order(
            id: "order-1",
            merchant: .entity(id: "merchant-1", name: "The Grocer", printed: "TILL MART"))
        let repository = InMemoryPurchasesRepository(hits: [
            .purchase(order, printedMatch: "TILL MART"),
            .line(
                id: "line-1", name: "Full Cream Milk", quantity: 1,
                lineTotal: Self.money(450), order: order, tagMatch: "Dairy"),
        ])

        let printed = try await repository.search(text: "till", status: .any)
        let tagged = try await repository.search(text: "dairy", status: .any)

        #expect(printed.map(\.id) == ["purchase:order-1", "line:line-1"])
        #expect(tagged.map(\.id) == ["line:line-1"])
        let calls = await repository.searchCalls
        #expect(calls.count == 2)
        #expect(calls[0].text == "till")
        #expect(calls[0].status == .any)
    }

    @Test("unmatched search retains only awaiting-settlement orders and their lines")
    func fakeFiltersUnmatched() async throws {
        let awaiting = Self.order(id: "waiting", status: .awaitingSettlement)
        let partial = Self.order(id: "partial", status: .partial)
        let repository = InMemoryPurchasesRepository(hits: [
            .purchase(awaiting, printedMatch: nil),
            .line(
                id: "waiting-line", name: "Milk", quantity: 1,
                lineTotal: Self.money(400), order: awaiting, tagMatch: nil),
            .purchase(partial, printedMatch: nil),
        ])

        let results = try await repository.search(text: "", status: .unmatched)

        #expect(results.map(\.id) == ["purchase:waiting", "line:waiting-line"])
    }

    private static func order(
        id: String,
        merchant: MerchantIdentity = .printed("Fake Store"),
        status: PurchaseSettlement = .linked
    ) -> PurchaseSearchOrder {
        PurchaseSearchOrder(
            id: id,
            merchant: merchant,
            orderedOn: Date(timeIntervalSince1970: 1_700_000_000),
            total: money(2_500),
            status: status)
    }

    private static func money(_ cents: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: cents, currencyCode: "AUD")
    }
}
