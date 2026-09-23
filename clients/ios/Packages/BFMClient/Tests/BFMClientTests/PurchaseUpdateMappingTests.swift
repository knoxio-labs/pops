import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository updates")
internal struct PurchaseUpdateMappingTests {
    @Test("the complete desired line set and opaque token are sent and the saved detail maps")
    func mapsRequestAndResponse() async throws {
        let sentBody = UpdateBodyRecorder()
        let transport = StubTransport { _, body in
            await sentBody.record(try await Data(collecting: body ?? HTTPBody(), upTo: 65_536))
            return Self.response(status: .ok, json: Self.detailJSON)
        }
        let repository = try BFMPurchasesRepository.stubbed(transport)
        let orderedAt = try #require(ISO8601Instant.parse("2026-09-21T01:02:03.000Z"))
        let update = PurchaseUpdate(
            merchantEntityID: "merchant-2",
            merchantEntityName: "New Cafe",
            orderedAt: orderedAt,
            totalCents: 1_900,
            lines: [
                PurchaseUpdateLine(
                    id: "line-1", name: "Coffee", quantity: 2, lineTotalCents: 1_500),
                PurchaseUpdateLine(
                    id: nil, name: "Cake", quantity: 1, lineTotalCents: 400),
            ],
            expectedUpdatedAt: "opaque-old-token"
        )

        let detail = try #require(try await repository.updatePurchase(id: "purchase-1", update))

        #expect(detail.updatedAt == "opaque-new-token")
        #expect(detail.edit?.changes.map(\.field) == [.merchant, .lineAdded])
        #expect(detail.edit?.changes.last?.itemID == "line-2")
        #expect(detail.lines.map(\.hasInventoryLink) == [true, false])
        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.method == .patch)
        #expect(sent.request.path == "/mobile/purchases/purchase-1")
        #expect(sent.operationID == "mobilePurchases.updatePurchase")
        let body = try #require(await sentBody.value)
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json["expectedUpdatedAt"] as? String == "opaque-old-token")
        #expect(json["merchantEntityId"] as? String == "merchant-2")
        #expect(json["orderedAt"] as? String == "2026-09-21T01:02:03.000Z")
        let lines = try #require(json["lines"] as? [[String: Any]])
        #expect(lines.count == 2)
        #expect(lines[0]["id"] as? String == "line-1")
        #expect(lines[1]["id"] == nil)
        #expect(lines[1]["name"] as? String == "Cake")
    }

    @Test("a missing purchase is an answered absence")
    func missingPurchase() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .notFound, json: Self.upstream(code: "not_found")))

        #expect(try await repository.updatePurchase(id: "missing", Self.update) == nil)
    }

    @Test(
        "conflict codes remain distinct",
        arguments: ["purchase_locked", "purchase_stale"])
    func conflictCode(code: String) async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .conflict, json: Self.upstream(code: code)))

        await #expect(throws: RepositoryError.conflict(code)) {
            try await repository.updatePurchase(id: "purchase-1", Self.update)
        }
    }

    @Test("authorization failures revoke the write")
    func unauthorized() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .forbidden,
                json: #"{"code":"device_revoked","message":"revoked"}"#))

        await #expect(throws: RepositoryError.unauthorized) {
            try await repository.updatePurchase(id: "purchase-1", Self.update)
        }
    }

    @Test("a request that never answers becomes a transport failure")
    func transportFailure() async throws {
        struct Offline: Error {}
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport { _, _ in throw Offline() })

        let thrown = await #expect(throws: RepositoryError.self) {
            try await repository.updatePurchase(id: "purchase-1", Self.update)
        }

        guard case .transport = try #require(thrown) else {
            Issue.record("expected transport failure")
            return
        }
    }

    @Test("an invalid edit timestamp is a contract mismatch")
    func malformedDetail() async throws {
        let malformed = Self.detailJSON.replacingOccurrences(
            of: "2026-09-21T01:05:00.000Z", with: "not-an-instant")
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: malformed))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.updatePurchase(id: "purchase-1", Self.update)
        }
    }

    @Test("a success body outside the generated contract is a contract mismatch")
    func malformedSuccessBody() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: #"{"unexpected":true}"#))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.updatePurchase(id: "purchase-1", Self.update)
        }
    }

    private static let update = PurchaseUpdate(
        lines: [], expectedUpdatedAt: "opaque-old-token")

    private static func response(
        status: HTTPResponse.Status, json: String
    ) -> (HTTPResponse, HTTPBody?) {
        (
            HTTPResponse(status: status, headerFields: [.contentType: "application/json"]),
            HTTPBody(json)
        )
    }

    private static func upstream(code: String) -> String {
        #"{"code":"\#(code)","message":"x","pillar":"purchases","retryable":false}"#
    }

    private static let detailJSON = """
        {"currency":"AUD","discountCents":0,
        "edit":{"editedAt":"2026-09-21T01:05:00.000Z","changes":[
        {"field":"merchant","itemId":null,"original":"Old Cafe","current":"New Cafe"},
        {"field":"lineAdded","itemId":"line-2","original":null,"current":"Cake"}]},
        "id":"purchase-1","itemCount":2,
        "items":[{"hasInventoryLink":true,"id":"line-1","lineTotalCents":1500,"name":"Coffee","quantity":2},
        {"id":"line-2","lineTotalCents":400,"name":"Cake","quantity":1}],
        "merchant":{"resolution":"entity","entityId":"merchant-2","name":"New Cafe"},
        "merchantName":"New Cafe","orderedAt":"2026-09-21T01:02:03.000Z",
        "orderedOn":"2026-09-21","receiptUri":null,"receiptUris":[],
        "shippingCents":0,"source":"receipt","status":"linked","subtotalCents":1900,
        "surchargeCents":0,"taxCents":0,"totalCents":1900,"updatedAt":"opaque-new-token"}
        """
}

private actor UpdateBodyRecorder {
    private(set) var value: Data?

    func record(_ value: Data) {
        self.value = value
    }
}
