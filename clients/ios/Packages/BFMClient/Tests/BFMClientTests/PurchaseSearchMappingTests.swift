import AppCore
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository search mapping")
internal struct PurchaseSearchMappingTests {
    @Test(
        "each settlement filter is sent in the wire's own vocabulary",
        arguments: [
            (PurchaseSearchStatus.unmatched, "awaiting_settlement"),
            (.matched, "linked"),
            (.partial, "partial"),
            (.cash, "settled_cash"),
            (.ignored, "ignored"),
        ])
    func sendsStatus(status: PurchaseSearchStatus, wire: String) async throws {
        let transport = StubTransport(status: .ok, json: #"{"hits":[],"nextCursor":null}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.search(
            query: Self.query("kmart", status: status), after: nil, limit: 20)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/purchases/search?q=kmart&limit=20&status=\(wire)")
    }

    @Test("any status sends no status filter")
    func anyOmitsStatus() async throws {
        let transport = StubTransport(status: .ok, json: #"{"hits":[],"nextCursor":null}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.search(
            query: Self.query("kmart"), after: nil, limit: 20)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/purchases/search?q=kmart&limit=20")
    }

    @Test("blank text sends no request", arguments: ["", "  \n"])
    func blankTextSendsNoRequest(text: String) async throws {
        let transport = StubTransport(status: .badRequest, json: "{}")
        let repository = try BFMPurchasesRepository.stubbed(transport)

        let page = try await repository.search(
            query: Self.query(text, status: .unmatched), after: nil, limit: 20)

        #expect(page.hits.isEmpty)
        #expect(page.nextCursor == nil)
        #expect(await transport.recorded.all.isEmpty)
    }

    @Test("a purchase hit keeps its order context and printed match")
    func mapsPurchaseHit() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"hits":[{"kind":"purchase","id":"purchase-1","merchantName":"Kmart",\
                    "totalCents":1999,"currency":"AUD","orderedOn":"2026-08-20",\
                    "status":"linked","matchField":"sourceOrderId","matchedText":"KM-42"}],\
                    "nextCursor":null,"totalCount":1}
                    """
            )
        )

        let page = try await repository.search(
            query: Self.query("km-42"), after: nil, limit: 20)

        let order = PurchaseSearchOrder(
            id: "purchase-1",
            merchant: .printed("Kmart"),
            orderedOn: try TransactionsWire.midnight(year: 2026, month: 8, day: 20),
            total: MoneyAmount(minorUnits: 1999, currencyCode: "AUD"),
            status: .linked)
        #expect(page.hits == [.purchase(order, printedMatch: "KM-42")])
        #expect(page.nextCursor == nil)
        #expect(page.totalCount == 1)
    }

    @Test("a line hit carries its owning purchase and the matched tag")
    func mapsTagLineHit() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: Self.lineHit(matchField: "tag", matchedText: "garden"))
        )

        let page = try await repository.search(
            query: Self.query("garden"), after: nil, limit: 20)

        let order = PurchaseSearchOrder(
            id: "purchase-7",
            merchant: .unattributed,
            orderedOn: try TransactionsWire.midnight(year: 2026, month: 9, day: 1),
            total: MoneyAmount(minorUnits: 5000, currencyCode: "AUD"),
            status: .awaitingSettlement)
        #expect(
            page.hits == [
                .line(
                    id: "line-3", name: "Hose", quantity: 2,
                    lineTotal: MoneyAmount(minorUnits: 1200, currencyCode: "AUD"),
                    order: order, tagMatch: "garden")
            ])
    }

    @Test("matched text on a non-tag line hit is not presented as a tag match")
    func nonTagLineHasNoTagMatch() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: Self.lineHit(matchField: "name", matchedText: "Hose"))
        )

        let page = try await repository.search(
            query: Self.query("hose"), after: nil, limit: 20)
        let hit = try #require(page.hits.first)

        guard case .line(_, _, _, _, _, let tagMatch) = hit else {
            Issue.record("expected a line hit, got \(hit)")
            return
        }
        #expect(tagMatch == nil)
    }

    @Test("an orderedOn that is not a calendar day is a contract mismatch")
    func malformedDayIsContractMismatch() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"hits":[{"kind":"purchase","id":"purchase-1","merchantName":null,\
                    "totalCents":1,"currency":"AUD","orderedOn":"2026-02-30",\
                    "status":"linked","matchField":"name","matchedText":null}],\
                    "nextCursor":null}
                    """
            )
        )

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.search(
                query: Self.query("x"), after: nil, limit: 20)
        }
    }

    @Test("an unauthorized response is the app's unauthorized error")
    func unauthorized() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .unauthorized, json: TransactionsWire.failure(code: "invalid_token"))
        )

        await #expect(throws: RepositoryError.unauthorized) {
            try await repository.search(
                query: Self.query("x"), after: nil, limit: 20)
        }
    }

    @Test("chosen tags are sent as repeated query items, sorted for a stable request")
    func sendsTags() async throws {
        let transport = StubTransport(status: .ok, json: #"{"hits":[],"nextCursor":null}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.search(
            query: Self.query("kmart", tags: ["garden", "camping"]), after: nil, limit: 20)

        let sent = try #require(await transport.recorded.all.first)
        #expect(
            sent.request.path
                == "/mobile/purchases/search?q=kmart&limit=20&tags=camping&tags=garden")
    }

    @Test("no chosen tags sends no tags filter")
    func emptyTagsOmitsFilter() async throws {
        let transport = StubTransport(status: .ok, json: #"{"hits":[],"nextCursor":null}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.search(
            query: Self.query("kmart"), after: nil, limit: 20)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/purchases/search?q=kmart&limit=20")
    }

    @Test("search sends the selected kind and page cursor and maps page metadata")
    func searchPageRequestAndResponse() async throws {
        let transport = StubTransport(
            status: .ok,
            json: #"{"hits":[],"nextCursor":"search-next","totalCount":37}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        let page = try await repository.search(
            query: Self.query("kmart", kind: .lines, status: .partial, tags: ["garden"]),
            after: "search-current", limit: 30)

        let sent = try #require(await transport.recorded.all.first)
        let expectedPath =
            "/mobile/purchases/search?q=kmart&kind=lines&cursor=search-current&limit=30"
            + "&status=partial&tags=garden"
        #expect(sent.request.path == expectedPath)
        #expect(page.hits.isEmpty)
        #expect(page.nextCursor == "search-next")
        #expect(page.totalCount == 37)
    }

    @Test("all search kinds omit the kind query")
    func allKindsOmitKindQuery() async throws {
        let transport = StubTransport(status: .ok, json: #"{"hits":[],"nextCursor":null}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.search(
            query: Self.query("kmart"), after: nil, limit: 20)

        let sent = try #require(await transport.recorded.all.first)
        let path = try #require(sent.request.path)
        #expect(!path.contains("kind="))
    }

    private static func lineHit(matchField: String, matchedText: String) -> String {
        """
        {"hits":[{"kind":"item","id":"line-3","purchaseId":"purchase-7","name":"Hose",\
        "quantity":2,"lineTotalCents":1200,"totalCents":5000,"currency":"AUD",\
        "merchantName":null,"orderedOn":"2026-09-01","status":"awaiting_settlement",\
        "matchField":"\(matchField)","matchedText":"\(matchedText)"}],"nextCursor":null}
        """
    }

    private static func query(
        _ text: String,
        kind: PurchaseSearchKind = .all,
        status: PurchaseSearchStatus = .any,
        tags: Set<String> = []
    ) -> PurchaseSearchQuery {
        PurchaseSearchQuery(text: text, kind: kind, status: status, tags: tags)
    }
}
