import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// The wire's three outcomes into ``ReceiptOutcome``, and the request this
/// repository sends to get there.
@Suite("BFMReceiptCaptureRepository mapping")
internal struct ReceiptCaptureMappingTests {
    private static let onePart = [ReceiptPart(mediaType: .jpeg, data: Data([0xFF, 0xD8]))]

    private func capture(
        _ status: HTTPResponse.Status = .ok,
        json: String,
        parts: [ReceiptPart] = onePart
    ) async throws -> ReceiptOutcome {
        try await BFMReceiptCaptureRepository
            .stubbed(StubTransport(status: status, json: json))
            .capture(parts)
    }

    @Test("a created purchase carries its id and whether these bytes were already on file")
    func createdOutcome() async throws {
        let outcome = try await capture(
            json: ReceiptCaptureWire.created(id: "purchase-42", alreadyStored: true))

        #expect(outcome == .created(purchaseId: "purchase-42", alreadyStored: true))
    }

    /// The one field a fresh upload and a re-upload of the same bytes must
    /// still disagree on — a duplicate purchase silently created twice is the
    /// failure this field exists to prevent.
    @Test("a first-time upload is not mistaken for a re-upload")
    func createdNotAlreadyStored() async throws {
        let outcome = try await capture(json: ReceiptCaptureWire.created(alreadyStored: false))

        guard case .created(_, let alreadyStored) = outcome else {
            Issue.record("expected .created, got \(outcome)")
            return
        }
        #expect(alreadyStored == false)
    }

    @Test("a needs-review problem's code becomes the app's closed failure kind")
    func needsReviewProblemKind() async throws {
        let outcome = try await capture(
            json: ReceiptCaptureWire.needsReview(
                problems: ReceiptCaptureWire.problem(code: "sum-mismatch", detail: "off by $2.10")
            )
        )

        guard case .needsReview(_, let failures, _) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        let expected = ReceiptGateFailure(
            kind: .sumMismatch, detail: "off by $2.10", deltaCents: nil)
        #expect(failures == [expected])
    }

    @Test(
        "every documented gate-failure kind decodes",
        arguments: [
            ("unreadable-total", ReceiptGateFailureKind.unreadableTotal),
            ("unreadable-line", .unreadableLine),
            ("no-lines", .noLines),
            ("negative-line", .negativeLine),
            ("sum-mismatch", .sumMismatch),
            ("damaged", .damaged),
        ]
    )
    func everyGateFailureKind(wire: String, expected: ReceiptGateFailureKind) async throws {
        let outcome = try await capture(
            json: ReceiptCaptureWire.needsReview(problems: ReceiptCaptureWire.problem(code: wire))
        )

        guard case .needsReview(_, let failures, _) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        #expect(failures.map(\.kind) == [expected])
    }

    /// The BFM's own contract deliberately does not send an extracted reading
    /// for `needs-review` — `MobileReceiptOutcomeSchema`'s comment states why.
    /// This is the one place that is asserted rather than merely known: a
    /// producer that started sending one would have this test still pass
    /// while the fields it added went unread.
    @Test("needs-review carries no extracted reading, because the wire sends none")
    func needsReviewCarriesNoExtraction() async throws {
        let outcome = try await capture(
            json: ReceiptCaptureWire.needsReview(
                problems: ReceiptCaptureWire.problem(code: "damaged"))
        )

        guard case .needsReview(let receiptURIs, _, let extracted) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        #expect(receiptURIs.isEmpty)
        #expect(extracted.merchantName == nil)
        #expect(extracted.lines.isEmpty)
    }

    @Test("an unreadable receipt carries the pillar's own reason")
    func unreadableOutcome() async throws {
        let outcome = try await capture(
            json: ReceiptCaptureWire.unreadable(reason: "the image is blank"))

        #expect(outcome == .unreadable(receiptURIs: [], reason: "the image is blank"))
    }

    /// The request this repository actually sends, not just the response it
    /// reads back — a mapping that decoded the answer correctly while sending
    /// the wrong upload would pass every test above and still fail on a real
    /// receipt.
    @Test("every part is sent, in order, base64-encoded under the contract's field names")
    func sendsEveryPartInOrder() async throws {
        let parts = [
            ReceiptPart(mediaType: .jpeg, data: Data([0x01, 0x02])),
            ReceiptPart(mediaType: .png, data: Data([0x03])),
        ]
        let capturedBody = CapturedBody()
        let transport = StubTransport { _, body in
            if let body {
                await capturedBody.store(try await Data(collecting: body, upTo: Int.max))
            }
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(ReceiptCaptureWire.created())
            )
        }

        _ = try await BFMReceiptCaptureRepository.stubbed(transport).capture(parts)

        let sent = try #require(await capturedBody.value)
        let decoded = try #require(
            try JSONSerialization.jsonObject(with: sent) as? [String: Any])
        let sentParts = try #require(decoded["parts"] as? [[String: Any]])

        #expect(sentParts.count == 2)
        #expect(sentParts[0]["dataBase64"] as? String == Data([0x01, 0x02]).base64EncodedString())
        #expect(sentParts[0]["mediaType"] as? String == "image/jpeg")
        #expect(sentParts[1]["dataBase64"] as? String == Data([0x03]).base64EncodedString())
        #expect(sentParts[1]["mediaType"] as? String == "image/png")
    }
}

/// A one-shot mailbox for a request body, since `ClientTransport.send` is
/// `Sendable` and non-mutating — matching ``RecordedRequests``' own reason for
/// being an actor rather than a `var` on the transport.
private actor CapturedBody {
    private(set) var value: Data?

    func store(_ data: Data) {
        value = data
    }
}
