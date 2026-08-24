import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository mapping")
internal struct PurchasesMappingTests {
    @Test("a purchase list row becomes the app's own vocabulary")
    func mapsAListRow() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                {"data":[{"id":"purchase-1","merchantName":"Kmart","orderedOn":"2026-08-20",\
                "totalCents":1999,"currency":"AUD","itemCount":3,"receiptUri":"pops://purchases/receipt/abc",\
                "status":"awaiting_settlement"}],"nextCursor":null}
                """
            )
        )

        let purchase = try #require(try await repository.purchases(after: nil).purchases.first)
        #expect(purchase.id == "purchase-1")
        #expect(purchase.merchantName == "Kmart")
        #expect(purchase.total == MoneyAmount(minorUnits: 1999, currencyCode: "AUD"))
        #expect(purchase.itemCount == 3)
        #expect(purchase.receiptURI == "pops://purchases/receipt/abc")
        #expect(purchase.orderedOn == (try TransactionsWire.midnight(year: 2026, month: 8, day: 20)))
    }
}

extension BFMPurchasesRepository {
    internal static func stubbed(_ transport: StubTransport) throws -> BFMPurchasesRepository {
        BFMPurchasesRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            ),
            timeZone: { TransactionsWire.timeZone }
        )
    }
}
