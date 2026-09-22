import AppCore
import HTTPTypes
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository detail mapping")
internal struct PurchaseDetailMappingTests {
    @Test("a full detail maps money, lines, source, and ordered receipt documents")
    func mapsFullDetail() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: Self.detailJSON))

        let detail = try #require(try await repository.purchaseDetail(id: "purchase-1"))

        #expect(detail.id == "purchase-1")
        #expect(detail.purchase.receiptURI == "compatibility-only")
        #expect(detail.subtotal == MoneyAmount(minorUnits: 1_000, currencyCode: "AUD"))
        #expect(detail.tax == MoneyAmount(minorUnits: 100, currencyCode: "AUD"))
        #expect(detail.shipping == MoneyAmount(minorUnits: 200, currencyCode: "AUD"))
        #expect(detail.discount == MoneyAmount(minorUnits: 50, currencyCode: "AUD"))
        #expect(detail.surcharge == MoneyAmount(minorUnits: 25, currencyCode: "AUD"))
        #expect(detail.source == "receipt")
        #expect(
            detail.lines == [
                PurchaseDetailLine(
                    id: "line-1", name: "Coffee", quantity: 2,
                    lineTotal: MoneyAmount(minorUnits: 1_275, currencyCode: "AUD"))
            ])
        #expect(detail.receiptURIs == ["pops://receipt/b", "pops://receipt/a"])
    }

    @Test("an empty receipt list stays empty rather than using the compatibility URI")
    func emptyReceiptList() async throws {
        let json = Self.detailJSON.replacingOccurrences(
            of: #""receiptUris":["pops://receipt/b","pops://receipt/a"]"#,
            with: #""receiptUris":[]"#)
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: json))

        let detail = try #require(try await repository.purchaseDetail(id: "purchase-1"))

        #expect(detail.receiptURIs.isEmpty)
    }

    @Test("a missing detail is an answered absence")
    func missingDetail() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .notFound, json: TransactionsWire.upstream(code: "not_found")))

        #expect(try await repository.purchaseDetail(id: "missing") == nil)
    }

    @Test("detail authorization and upstream failures keep their repository meanings")
    func detailFailures() async throws {
        let unauthorized = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .unauthorized,
                json: TransactionsWire.failure(code: "invalid_token")))
        let unavailable = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .serviceUnavailable,
                json: TransactionsWire.upstream(code: "upstream_unavailable")))

        await #expect(throws: RepositoryError.unauthorized) {
            try await unauthorized.purchaseDetail(id: "purchase-1")
        }
        await #expect(throws: RepositoryError.unavailable) {
            try await unavailable.purchaseDetail(id: "purchase-1")
        }
    }

    private static let detailJSON = """
        {"currency":"AUD","discountCents":50,"id":"purchase-1","itemCount":2,
        "items":[{"id":"line-1","lineTotalCents":1275,"name":"Coffee","quantity":2}],
        "merchant":{"resolution":"name","name":"Cafe"},"merchantName":"Cafe",
        "orderedAt":"2026-09-20T10:00:00+10:00","orderedOn":"2026-09-20",
        "receiptUri":"compatibility-only",
        "receiptUris":["pops://receipt/b","pops://receipt/a"],
        "shippingCents":200,"source":"receipt","status":"linked","subtotalCents":1000,
        "surchargeCents":25,"taxCents":100,"totalCents":1275}
        """
}
