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
        #expect(purchase.merchant == .printed("Kmart"))
        #expect(purchase.total == MoneyAmount(minorUnits: 1999, currencyCode: "AUD"))
        #expect(purchase.itemCount == 3)
        #expect(purchase.receiptURI == "pops://purchases/receipt/abc")
        #expect(
            purchase.orderedOn == (try TransactionsWire.midnight(year: 2026, month: 8, day: 20))
        )
    }

    /// `GET /mobile/purchases` sends one nullable merchant string and no
    /// entity id, so a purchase the pillar resolved to a contacts entity is
    /// indistinguishable here from one it never matched — both arrive as
    /// ``MerchantIdentity/printed``. That is the gap POPS-3634 closes, and
    /// this test is what will fail when it does.
    @Test("a resolved merchant still arrives as a printed label, because the wire carries no id")
    func resolutionCannotCrossTheWire() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-2","merchantName":"K mart","orderedOn":"2026-08-20",\
                    "totalCents":3000,"currency":"AUD","itemCount":3,"receiptUri":null,\
                    "status":"linked"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(try await repository.purchases(after: nil).purchases.first)
        #expect(purchase.merchant == .printed("K mart"))
        #expect(purchase.merchant.isUnverified)
        #expect(purchase.status == .linked)
    }

    @Test("a row with no merchant is unattributed rather than an empty name")
    func absentMerchantIsUnattributed() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-3","merchantName":null,"orderedOn":"2026-08-20",\
                    "totalCents":2280,"currency":"AUD","itemCount":2,"receiptUri":null,\
                    "status":"awaiting_settlement"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(try await repository.purchases(after: nil).purchases.first)
        #expect(purchase.merchant == .unattributed)
        #expect(purchase.merchant.displayName == nil)
    }

    /// A merchant name that is present but blank is the same fact as no
    /// merchant, and drawing it would put an empty gap where a name goes.
    @Test("a blank merchant name is unattributed, not a name made of spaces")
    func blankMerchantIsUnattributed() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-4","merchantName":"   ","orderedOn":"2026-08-20",\
                    "totalCents":100,"currency":"AUD","itemCount":1,"receiptUri":null,\
                    "status":"ignored"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(try await repository.purchases(after: nil).purchases.first)
        #expect(purchase.merchant == .unattributed)
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
