import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository mapping")
internal struct PurchasesMappingTests {
    @Test("the unsettled filter is sent on the purchases query")
    func sendsUnsettledFilter() async throws {
        let transport = StubTransport(status: .ok, json: #"{"data":[],"nextCursor":null}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.purchases(after: nil, statusFilter: .unsettled)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/purchases?status=unsettled")
    }

    @Test("a first-page total crosses into the app page")
    func mapsTotalCount() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: #"{"data":[],"nextCursor":null,"total":7}"#
            )
        )

        let page = try await repository.purchases(after: nil, statusFilter: .all)

        #expect(page.totalCount == 7)
    }

    @Test("an omitted total stays absent")
    func absentTotalStaysAbsent() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: #"{"data":[],"nextCursor":null}"#)
        )

        let page = try await repository.purchases(after: nil, statusFilter: .all)

        #expect(page.totalCount == nil)
    }

    @Test("a purchase list row becomes the app's own vocabulary")
    func mapsAListRow() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-1","merchant":{"resolution":"name","name":"Kmart"},\
                    "merchantName":"Kmart","orderedOn":"2026-08-20",\
                    "totalCents":1999,"currency":"AUD","itemCount":3,"receiptUri":"pops://purchases/receipt/abc",\
                    "status":"awaiting_settlement"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).purchases.first)
        #expect(purchase.id == "purchase-1")
        #expect(purchase.merchant == .printed("Kmart"))
        #expect(purchase.total == MoneyAmount(minorUnits: 1999, currencyCode: "AUD"))
        #expect(purchase.itemCount == 3)
        #expect(purchase.receiptURI == "pops://purchases/receipt/abc")
        #expect(
            purchase.orderedOn == (try TransactionsWire.midnight(year: 2026, month: 8, day: 20))
        )
    }

    /// The gap POPS-3634 closed: `merchant` now carries the three-way
    /// resolution, so a purchase the pillar matched to a contacts entity
    /// shows THAT entity's name — not the till's wording, which survives
    /// separately as `printed`.
    @Test("a resolved merchant arrives as the entity's own name, printed wording kept alongside")
    func resolvedMerchantCrossesTheWire() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-2",\
                    "merchant":{"resolution":"entity","entityId":"ent-1","name":"Kmart"},\
                    "merchantName":"K mart","orderedOn":"2026-08-20",\
                    "totalCents":3000,"currency":"AUD","itemCount":3,"receiptUri":null,\
                    "status":"linked"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).purchases.first)
        #expect(purchase.merchant == .entity(id: "ent-1", name: "Kmart", printed: "K mart"))
        #expect(purchase.merchant.displayName == "Kmart")
        #expect(!purchase.merchant.isUnverified)
        #expect(purchase.status == .linked)
    }

    /// A batched contacts lookup can fail to name an entity it still
    /// resolved — `name` comes back `null` — and the row falls back to the
    /// till's own wording rather than showing a blank.
    @Test("an entity resolved with no name falls back to the printed wording")
    func resolvedMerchantWithNoNameFallsBackToPrinted() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-5",\
                    "merchant":{"resolution":"entity","entityId":"ent-1","name":null},\
                    "merchantName":"K mart","orderedOn":"2026-08-20",\
                    "totalCents":3000,"currency":"AUD","itemCount":3,"receiptUri":null,\
                    "status":"linked"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).purchases.first)
        #expect(purchase.merchant == .entity(id: "ent-1", name: "K mart", printed: "K mart"))
    }

    @Test("a row with no merchant is unattributed rather than an empty name")
    func absentMerchantIsUnattributed() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-3","merchant":{"resolution":"unattributed"},\
                    "merchantName":null,"orderedOn":"2026-08-20",\
                    "totalCents":2280,"currency":"AUD","itemCount":2,"receiptUri":null,\
                    "status":"awaiting_settlement"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).purchases.first)
        #expect(purchase.merchant == .unattributed)
        #expect(purchase.merchant.displayName == nil)
    }

    /// A blank printed wording is the same fact as no wording, so the last
    /// resort — an entity resolved with no name from either source — falls
    /// back to the id rather than a name made of spaces. Never seen live
    /// (see `merchant(from:printed:)`'s docstring), but the fallback chain is
    /// still typed, so it is still tested.
    @Test("an entity with no name from either source falls back to the id, not a blank")
    func entityWithNoNameAnywhereFallsBackToId() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"purchase-4",\
                    "merchant":{"resolution":"entity","entityId":"ent-9","name":null},\
                    "merchantName":"   ","orderedOn":"2026-08-20",\
                    "totalCents":100,"currency":"AUD","itemCount":1,"receiptUri":null,\
                    "status":"ignored"}],"nextCursor":null}
                    """
            )
        )

        let purchase = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).purchases.first)
        #expect(purchase.merchant == .entity(id: "ent-9", name: "ent-9", printed: "ent-9"))
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
