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
    @Test("a needs-review problem carries its kind, its detail and how far off it was")
    func needsReviewProblemKind() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.needsReview(
                problems: ReceiptCaptureWire.problem(
                    code: "sum-mismatch", detail: "off by $2.10", deltaCents: "-210")
            )
        )

        guard case .needsReview(_, let failures, _) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        let expected = ReceiptGateFailure(
            kind: .sumMismatch, detail: "off by $2.10", deltaCents: -210)
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
            ("ambiguous-tax", .ambiguousTax),
            ("damaged", .damaged),
        ]
    )
    func everyGateFailureKind(wire: String, expected: ReceiptGateFailureKind) async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.needsReview(problems: ReceiptCaptureWire.problem(code: wire))
        )

        guard case .needsReview(_, let failures, _) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        #expect(failures.map(\.kind) == [expected])
    }

    /// The BFM keeps the wire's `code` open so a gate that grows a reason does
    /// not break a build already on somebody's phone. Refusing the outcome
    /// here would spend that guarantee: a receipt that genuinely needs review
    /// would reach its owner as "update the app".
    @Test("a gate reason invented after this build shipped still renders")
    func unrecognisedGateFailureKind() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.needsReview(
                problems: ReceiptCaptureWire.problem(
                    code: "negative-shipping", detail: "shipping read as -$4.00"))
        )

        guard case .needsReview(_, let failures, _) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        #expect(failures.map(\.kind) == [.unrecognised("negative-shipping")])
        #expect(failures.map(\.detail) == ["shipping read as -$4.00"])
    }

    /// The reading is what the gate's objections are about, so every field of
    /// it has to survive the boundary — a screen comparing this against the
    /// photograph is the whole reason the outcome exists.
    @Test("needs-review carries the reading, field for field")
    func needsReviewCarriesTheReading() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.needsReview(
                receiptCount: 3,
                problems: ReceiptCaptureWire.problem(code: "damaged"))
        )

        guard case .needsReview(let receiptCount, _, let extracted) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        #expect(receiptCount == 3)
        #expect(extracted.merchantName == "Woolworths")
        #expect(extracted.address == "12 Example St")
        #expect(extracted.purchasedOn == "2026-03-05")
        #expect(extracted.purchasedAt == "14:05")
        #expect(extracted.currency == "AUD")
        #expect(extracted.total == "$84.20")
        #expect(extracted.tax == "$7.65")
        #expect(extracted.discounts == ["$2.00"])
        #expect(extracted.surcharges == ["$0.50"])
        #expect(extracted.shipping == nil)
        #expect(extracted.unreadableNotes == ["line 7 is smudged"])
        #expect(
            extracted.lines
                == [
                    ExtractedReceiptLine(
                        description: "MILK 2L", amount: "$3.10", quantity: 2,
                        unitNote: "2 @ $1.55")
                ]
        )
    }

    @Test("a receipt the model read nothing off still decodes, as an empty reading")
    func needsReviewWithNothingRead() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.needsReview(
                extracted: ReceiptCaptureWire.extracted(
                    merchantName: "null", address: "null", purchasedOn: "null",
                    purchasedAt: "null", currency: "null", tax: "null", discounts: "[]",
                    surcharges: "[]", lines: "[]", unreadableNotes: "[]"),
                problems: ReceiptCaptureWire.problem(code: "no-lines"))
        )

        guard case .needsReview(_, _, let extracted) = outcome else {
            Issue.record("expected .needsReview, got \(outcome)")
            return
        }
        #expect(extracted.merchantName == nil)
        #expect(extracted.lines.isEmpty)
    }

    @Test("an unreadable receipt carries the pillar's own reason")
    func unreadableOutcome() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.unreadable(reason: "the image is blank", receiptCount: 2))

        #expect(outcome == .unreadable(receiptCount: 2, reason: "the image is blank"))
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

        let sentParts = try await capturedParts(for: parts)

        #expect(sentParts.count == 2)
        #expect(sentParts[0]["dataBase64"] as? String == Data([0x01, 0x02]).base64EncodedString())
        #expect(sentParts[0]["mediaType"] as? String == "image/jpeg")
        #expect(sentParts[1]["dataBase64"] as? String == Data([0x03]).base64EncodedString())
        #expect(sentParts[1]["mediaType"] as? String == "image/png")
    }

    @Test("capture metadata keeps the device offset and permitted location")
    func sendsCaptureMetadata() async throws {
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
        let timeZone = try #require(TimeZone(identifier: "Australia/Perth"))
        let date = try #require(ISO8601DateFormatter().date(from: "2026-08-24T09:15:30Z"))

        _ = try await BFMReceiptCaptureRepository.stubbed(
            transport,
            now: { date },
            timeZone: { timeZone },
            captureLocation: { CaptureLocation(latitude: -31.9505, longitude: 115.8605) }
        ).capture([ReceiptPart(mediaType: .jpeg, data: Data([0xFF, 0xD8]))])

        let sent = try #require(await capturedBody.value)
        let decoded = try #require(
            try JSONSerialization.jsonObject(with: sent) as? [String: Any])
        let capture = try #require(decoded["capture"] as? [String: Any])
        let location = try #require(capture["location"] as? [String: Double])

        #expect(capture["capturedAt"] as? String == "2026-08-24T17:15:30.000+08:00")
        #expect(capture["timeZone"] as? String == "Australia/Perth")
        #expect(location["latitude"] == -31.9505)
        #expect(location["longitude"] == 115.8605)
    }

    /// Every ``ReceiptMediaType`` case against the wire string
    /// `purchases`' vision pipeline actually reads (`pillars/bfm/src/api/purchases/client.ts`
    /// forwards `parts` unchanged, so a wrong pairing here reaches it verbatim).
    ///
    /// `expectedWireValue`'s `switch` has no `default`: a `ReceiptMediaType`
    /// case added without a line here fails the build, not just this test —
    /// the same guarantee `arguments: ReceiptMediaType.allCases` gives against
    /// a case that never gets exercised at all.
    @Test(
        "every media type maps to the wire value the vision pipeline expects",
        arguments: ReceiptMediaType.allCases
    )
    func everyMediaTypeMapsToItsDocumentedWireValue(mediaType: ReceiptMediaType) async throws {
        let expectedWireValue: String
        switch mediaType {
        case .jpeg: expectedWireValue = "image/jpeg"
        case .png: expectedWireValue = "image/png"
        case .webp: expectedWireValue = "image/webp"
        case .gif: expectedWireValue = "image/gif"
        case .pdf: expectedWireValue = "application/pdf"
        case .plainText: expectedWireValue = "text/plain"
        }

        let sentParts = try await capturedParts(
            for: [ReceiptPart(mediaType: mediaType, data: Data([0x00]))])

        #expect(sentParts.first?["mediaType"] as? String == expectedWireValue)
    }

    /// Sends `parts` through a stubbed transport and decodes the JSON body
    /// that was actually put on the wire, shared by every test that checks
    /// what got sent rather than what came back.
    private func capturedParts(for parts: [ReceiptPart]) async throws -> [[String: Any]] {
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
        return try #require(decoded["parts"] as? [[String: Any]])
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
