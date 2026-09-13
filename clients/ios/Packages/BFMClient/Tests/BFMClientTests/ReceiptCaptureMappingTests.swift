import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

private let sumMismatch = ReceiptCaptureWire.gateFailure(
    code: "sum-mismatch",
    detail: "off by $2.10",
    deltaCents: "-210"
)

private let oneLine = """
    {"name":"Timber Pine DAR 42x19","quantity":null,\
    "unitPriceCents":1250,"lineTotalCents":1250,"notes":[]}
    """

/// The wire's two `extractReceipt` outcomes into ``ReceiptExtraction``, and
/// the request this repository sends to get there.
@Suite("BFMReceiptCaptureRepository extract mapping")
internal struct ReceiptCaptureMappingTests {
    @Test("a gate failure carries its kind, its detail and how far off it was")
    func draftFailureKind() async throws {
        let outcome = try await extractReceipt(
            json: ReceiptCaptureWire.draft(
                reconciled: false,
                failures: "[\(sumMismatch)]"
            )
        )

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        let expected = ReceiptGateFailure(
            kind: .sumMismatch, detail: "off by $2.10", deltaCents: -210)
        #expect(reading.failures == [expected])
        #expect(reading.reconciled == false)
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
        let outcome = try await extractReceipt(
            json: ReceiptCaptureWire.draft(
                reconciled: false, failures: "[\(ReceiptCaptureWire.gateFailure(code: wire))]")
        )

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        #expect(reading.failures.map(\.kind) == [expected])
    }

    /// The BFM keeps the wire's `code` open so a gate that grows a reason does
    /// not break a build already on somebody's phone.
    @Test("a gate reason invented after this build shipped still renders")
    func unrecognisedGateFailureKind() async throws {
        let outcome = try await extractReceipt(
            json: ReceiptCaptureWire.draft(
                reconciled: false,
                failures:
                    "[\(ReceiptCaptureWire.gateFailure(code: "negative-shipping", detail: "shipping read as -$4.00"))]"
            )
        )

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        #expect(reading.failures.map(\.kind) == [.unrecognised("negative-shipping")])
        #expect(reading.failures.map(\.detail) == ["shipping read as -$4.00"])
    }

    /// A reconciled draft carries the same editable fields as an unreconciled
    /// one — no outcome gates field editability.
    @Test("a reconciled draft carries the reading, field for field, as printed-looking text")
    func reconciledDraftCarriesTheReading() async throws {
        let outcome = try await extractReceipt(
            json: ReceiptCaptureWire.draft(
                reconciled: true,
                merchantName: "Bunnings Warehouse",
                totalCents: 2750,
                items: "[\(oneLine)]"
            )
        )

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        #expect(reading.reconciled == true)
        #expect(reading.extracted.merchantName == "Bunnings Warehouse")
        #expect(reading.extracted.total == "27.50")
        #expect(
            reading.extracted.lines == [
                ExtractedReceiptLine(
                    description: "Timber Pine DAR 42x19", amount: "12.50", quantity: nil,
                    unitNote: nil)
            ])
    }

    @Test("an unreadable receipt carries the pillar's own reason")
    func unreadableOutcome() async throws {
        let outcome = try await extractReceipt(
            json: ReceiptCaptureWire.unreadable(reason: "the image is blank"))

        guard case .unreadable(_, let reason) = outcome else {
            Issue.record("expected .unreadable, got \(outcome)")
            return
        }
        #expect(reason == "the image is blank")
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

        let sentParts = try await extractedParts(for: parts)

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
                HTTPBody(ReceiptCaptureWire.draft())
            )
        }
        let timeZone = try #require(TimeZone(identifier: "Australia/Perth"))
        let date = try #require(ISO8601DateFormatter().date(from: "2026-08-24T09:15:30Z"))

        _ = try await BFMReceiptCaptureRepository.stubbed(
            transport,
            now: { date },
            timeZone: { timeZone },
            captureLocation: { CaptureLocation(latitude: -31.9505, longitude: 115.8605) }
        ).extract([ReceiptPart(mediaType: .jpeg, data: Data([0xFF, 0xD8]))])

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

        let sentParts = try await extractedParts(
            for: [ReceiptPart(mediaType: mediaType, data: Data([0x00]))])

        #expect(sentParts.first?["mediaType"] as? String == expectedWireValue)
    }

    /// Sends `parts` through a stubbed transport and decodes the JSON body
    /// that was actually put on the wire, shared by every test that checks
    /// what got sent rather than what came back.
    private func extractedParts(for parts: [ReceiptPart]) async throws -> [[String: Any]] {
        let capturedBody = CapturedBody()
        let transport = StubTransport { _, body in
            if let body {
                await capturedBody.store(try await Data(collecting: body, upTo: Int.max))
            }
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(ReceiptCaptureWire.draft())
            )
        }

        _ = try await BFMReceiptCaptureRepository.stubbed(transport).extract(parts)

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
