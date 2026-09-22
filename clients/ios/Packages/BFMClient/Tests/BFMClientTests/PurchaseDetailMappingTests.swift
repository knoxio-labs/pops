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
        #expect(detail.updatedAt == "opaque-version-token")
        #expect(detail.edit?.changes.first?.field == .merchant)
        #expect(detail.edit?.changes.first?.original == "Old Cafe")
        #expect(detail.edit?.changes.first?.current == "Cafe")
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

    @Test("a null edit remains absent while the opaque update token is retained")
    func nullEdit() async throws {
        let json = Self.detailJSON.replacingOccurrences(
            of: Self.editJSON,
            with: #""edit":null"#)
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: json))

        let detail = try #require(try await repository.purchaseDetail(id: "purchase-1"))

        #expect(detail.edit == nil)
        #expect(detail.updatedAt == "opaque-version-token")
    }

    @Test("a detail entity with no name falls back to the printed wording")
    func nilEntityNameUsesPrintedWording() async throws {
        let json = Self.detailJSON
            .replacingOccurrences(
                of: #""merchant":{"resolution":"name","name":"Cafe"}"#,
                with: #""merchant":{"resolution":"entity","entityId":"entity-1","name":null}"#
            )
            .replacingOccurrences(
                of: #""merchantName":"Cafe""#, with: #""merchantName":"Café till""#)
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: json))

        let detail = try #require(try await repository.purchaseDetail(id: "purchase-1"))

        #expect(
            detail.purchase.merchant
                == .entity(id: "entity-1", name: "Café till", printed: "Café till"))
    }

    @Test("a detail entity with no usable names falls back to its id")
    func blankEntityNamesUseID() async throws {
        let json = Self.detailJSON
            .replacingOccurrences(
                of: #""merchant":{"resolution":"name","name":"Cafe"}"#,
                with: #""merchant":{"resolution":"entity","entityId":"entity-1","name":null}"#
            )
            .replacingOccurrences(of: #""merchantName":"Cafe""#, with: #""merchantName":"   ""#)
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: json))

        let detail = try #require(try await repository.purchaseDetail(id: "purchase-1"))

        #expect(
            detail.purchase.merchant
                == .entity(id: "entity-1", name: "entity-1", printed: "entity-1"))
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

    private static let detailJSON = [
        """
        {"currency":"AUD","discountCents":50,
        """,
        editJSON,
        """
        ,"id":"purchase-1","itemCount":2,
        "items":[{"id":"line-1","lineTotalCents":1275,"name":"Coffee","quantity":2}],
        "merchant":{"resolution":"name","name":"Cafe"},"merchantName":"Cafe",
        "orderedAt":"2026-09-20T10:00:00+10:00","orderedOn":"2026-09-20",
        "receiptUri":"compatibility-only",
        "receiptUris":["pops://receipt/b","pops://receipt/a"],
        "shippingCents":200,"source":"receipt","status":"linked","subtotalCents":1000,
        "surchargeCents":25,"taxCents":100,"totalCents":1275,
        "updatedAt":"opaque-version-token"}
        """,
    ].joined()

    private static let editJSON =
        #""edit":{"editedAt":"2026-09-20T10:05:00.000Z","changes":["#
        + #"{"field":"merchant","itemId":null,"original":"Old Cafe","current":"Cafe"}]}"#
}
