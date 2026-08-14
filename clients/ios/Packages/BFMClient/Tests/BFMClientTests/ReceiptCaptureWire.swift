import Foundation
import Testing

@testable import BFMClient

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

    internal static func needsReview(problems: String...) -> String {
        """
        {"kind":"needs-review","problems":[\(problems.joined(separator: ","))]}
        """
    }

    internal static func problem(code: String, detail: String = "off by a bit") -> String {
        """
        {"code":"\(code)","detail":"\(detail)"}
        """
    }

    internal static func unreadable(reason: String = "the image is blank") -> String {
        """
        {"kind":"unreadable","reason":"\(reason)"}
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
