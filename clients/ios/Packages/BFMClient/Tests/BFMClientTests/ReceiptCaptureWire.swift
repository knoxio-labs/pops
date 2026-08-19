import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// One receipt through a stubbed transport, shared by every suite that reads
/// what came back rather than asserting on what went out.
internal func captureReceipt(
    _ status: HTTPResponse.Status = .ok,
    json: String,
    parts: [ReceiptPart] = [ReceiptPart(mediaType: .jpeg, data: Data([0xFF, 0xD8]))]
) async throws -> ReceiptOutcome {
    try await BFMReceiptCaptureRepository
        .stubbed(StubTransport(status: status, json: json))
        .capture(parts)
}

/// The bodies `POST /mobile/purchases/receipts` can answer with, written as
/// the JSON the BFM actually sends rather than built through the generated
/// types — see ``TransactionsWire``'s own note for why.
internal enum ReceiptCaptureWire {
    internal static func created(
        id: String = "purchase-1",
        merchantName: String? = "Woolworths",
        totalCents: Int = 4599,
        currency: String = "AUD",
        orderedAt: String = "2026-03-05T10:00:00.000Z",
        itemCount: Int = 3,
        alreadyStored: Bool = false
    ) -> String {
        let merchantField = merchantName.map { "\"\($0)\"" } ?? "null"
        return """
            {"kind":"created","alreadyStored":\(alreadyStored),\
            "purchase":{"id":"\(id)","merchantName":\(merchantField),\
            "totalCents":\(totalCents),"currency":"\(currency)",\
            "orderedAt":"\(orderedAt)","itemCount":\(itemCount)}}
            """
    }

    internal static func needsReview(
        receiptCount: Int = 1,
        extracted: String = ReceiptCaptureWire.extracted(),
        problems: String...
    ) -> String {
        """
        {"kind":"needs-review","receiptCount":\(receiptCount),\
        "problems":[\(problems.joined(separator: ","))],"extracted":\(extracted)}
        """
    }

    /// A reading with every field populated. A test asserting an absence
    /// overrides the field it is about rather than starting from a blank, so
    /// "the mapper drops this" cannot pass because nothing was there.
    internal static func extracted(
        merchantName: String = "\"Woolworths\"",
        address: String = "\"12 Example St\"",
        purchasedOn: String = "\"2026-03-05\"",
        purchasedAt: String = "\"14:05\"",
        currency: String = "\"AUD\"",
        total: String = "$84.20",
        tax: String = "\"$7.65\"",
        discounts: String = "[\"$2.00\"]",
        surcharges: String = "[\"$0.50\"]",
        shipping: String = "null",
        lines: String = oneLine,
        unreadableNotes: String = "[\"line 7 is smudged\"]"
    ) -> String {
        """
        {"merchantName":\(merchantName),"address":\(address),\
        "purchasedOn":\(purchasedOn),"purchasedAt":\(purchasedAt),\
        "currency":\(currency),"total":"\(total)","tax":\(tax),\
        "discounts":\(discounts),"surcharges":\(surcharges),"shipping":\(shipping),\
        "lines":\(lines),"unreadableNotes":\(unreadableNotes)}
        """
    }

    /// One line, as the model transcribed it. A constant rather than a
    /// default expression so the signature stays inside a line.
    internal static let oneLine = """
        [{"description":"MILK 2L","amount":"$3.10","quantity":2,"unitNote":"2 @ $1.55"}]
        """

    internal static func problem(
        code: String, detail: String = "off by a bit", deltaCents: String = "null"
    ) -> String {
        """
        {"code":"\(code)","detail":"\(detail)","deltaCents":\(deltaCents)}
        """
    }

    internal static func unreadable(
        reason: String = "the image is blank", receiptCount: Int = 1
    ) -> String {
        """
        {"kind":"unreadable","receiptCount":\(receiptCount),"reason":"\(reason)"}
        """
    }

    internal static func failure(code: String, message: String = "no") -> String {
        """
        {"code":"\(code)","message":"\(message)"}
        """
    }

    internal static func payloadTooLarge(
        maxBytes: Int = 20_000_000, message: String = "too big"
    ) -> String {
        """
        {"code":"payload_too_large","maxBytes":\(maxBytes),"message":"\(message)"}
        """
    }

    internal static let rateLimited = """
        {"code":"rate_limited","message":"slow down","retryAfterSeconds":30}
        """

    internal static func upstream(code: String) -> String {
        """
        {"code":"\(code)","pillar":"purchases","retryable":true,"message":"no"}
        """
    }
}

extension BFMReceiptCaptureRepository {
    internal static func stubbed(
        _ transport: StubTransport
    ) throws -> BFMReceiptCaptureRepository {
        BFMReceiptCaptureRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            )
        )
    }
}
