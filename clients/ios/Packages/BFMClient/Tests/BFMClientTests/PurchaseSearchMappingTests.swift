import AppCore
import Foundation
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
        let transport = StubTransport(status: .ok, json: #"{"hits":[]}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.search(text: "kmart", status: status)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/purchases/search?q=kmart&status=\(wire)")
    }

    @Test("any status sends no status filter")
    func anyOmitsStatus() async throws {
        let transport = StubTransport(status: .ok, json: #"{"hits":[]}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        _ = try await repository.search(text: "kmart", status: .any)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/purchases/search?q=kmart")
    }

    @Test("blank text sends no request", arguments: ["", "  \n"])
    func blankTextSendsNoRequest(text: String) async throws {
        let transport = StubTransport(status: .badRequest, json: "{}")
        let repository = try BFMPurchasesRepository.stubbed(transport)

        let hits = try await repository.search(text: text, status: .unmatched)

        #expect(hits.isEmpty)
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
                    "status":"linked","matchField":"sourceOrderId","matchedText":"KM-42"}]}
                    """
            )
        )

        let hits = try await repository.search(text: "km-42", status: .any)

        let order = PurchaseSearchOrder(
            id: "purchase-1",
            merchant: .printed("Kmart"),
            orderedOn: try TransactionsWire.midnight(year: 2026, month: 8, day: 20),
            total: MoneyAmount(minorUnits: 1999, currencyCode: "AUD"),
            status: .linked)
        #expect(hits == [.purchase(order, printedMatch: "KM-42")])
    }

    @Test("a line hit carries its owning purchase and the matched tag")
    func mapsTagLineHit() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: Self.lineHit(matchField: "tag", matchedText: "garden"))
        )

        let hits = try await repository.search(text: "garden", status: .any)

        let order = PurchaseSearchOrder(
            id: "purchase-7",
            merchant: .unattributed,
            orderedOn: try TransactionsWire.midnight(year: 2026, month: 9, day: 1),
            total: MoneyAmount(minorUnits: 5000, currencyCode: "AUD"),
            status: .awaitingSettlement)
        #expect(
            hits == [
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

        let hit = try #require(try await repository.search(text: "hose", status: .any).first)

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
                    "status":"linked","matchField":"name","matchedText":null}]}
                    """
            )
        )

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.search(text: "x", status: .any)
        }
    }

    @Test("an unauthorized response is the app's unauthorized error")
    func unauthorized() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .unauthorized, json: TransactionsWire.failure(code: "invalid_token"))
        )

        await #expect(throws: RepositoryError.unauthorized) {
            try await repository.search(text: "x", status: .any)
        }
    }

    private static func lineHit(matchField: String, matchedText: String) -> String {
        """
        {"hits":[{"kind":"item","id":"line-3","purchaseId":"purchase-7","name":"Hose",\
        "quantity":2,"lineTotalCents":1200,"totalCents":5000,"currency":"AUD",\
        "merchantName":null,"orderedOn":"2026-09-01","status":"awaiting_settlement",\
        "matchField":"\(matchField)","matchedText":"\(matchedText)"}]}
        """
    }
}
