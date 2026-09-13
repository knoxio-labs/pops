import AppCore
import AppCoreFakes
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// One receipt through a stubbed transport, shared by every suite that reads
/// what came back from `extractReceipt` rather than asserting on what went
/// out.
internal func extractReceipt(
    _ status: HTTPResponse.Status = .ok,
    json: String,
    parts: [ReceiptPart] = [ReceiptPart(mediaType: .jpeg, data: Data([0xFF, 0xD8]))]
) async throws -> ReceiptExtraction {
    try await BFMReceiptCaptureRepository
        .stubbed(StubTransport(status: status, json: json))
        .extract(parts)
}

/// Saves a draft through a stubbed transport, for suites that read what
/// `saveDraft` mapped a response into.
internal func saveDraft(
    _ status: HTTPResponse.Status = .ok,
    json: String,
    payload: ReceiptDraftSavePayload = .fake()
) async throws -> ReceiptPurchase {
    try await BFMReceiptCaptureRepository
        .stubbed(StubTransport(status: status, json: json))
        .saveDraft(payload)
}

/// The bodies `POST /mobile/purchases/receipts/extract`,
/// `POST /mobile/purchases/receipts` and `POST /mobile/purchases/manual` can
/// answer with, written as the JSON the BFM actually sends rather than built
/// through the generated types — see ``TransactionsWire``'s own note for why.
internal enum ReceiptCaptureWire {
    internal static func draft(
        reconciled: Bool = true,
        receiptUris: String = "[\"pops://purchases/receipt/\(String(repeating: "a", count: 64))\"]",
        failures: String = "[]",
        merchantName: String? = "Bunnings Warehouse",
        orderedAt: String = "2026-08-01T14:32:00+10:00",
        currency: String = "AUD",
        totalCents: Int = 2750,
        subtotalCents: Int = 2750,
        taxCents: Int = 0,
        surchargeCents: Int = 0,
        shippingCents: Int = 0,
        discountCents: Int = 0,
        items: String = oneItem,
        documents: String =
            "[{\"documentUri\":\"pops://purchases/receipt/\(String(repeating: "a", count: 64))\",\"kind\":\"receipt\"}]"
    ) -> String {
        let merchantField = merchantName.map { "\"\($0)\"" } ?? "null"
        return """
            {"kind":"draft","receiptUris":\(receiptUris),"reconciled":\(reconciled),\
            "failures":\(failures),"draft":{"merchantName":\(merchantField),\
            "orderedAt":"\(orderedAt)","currency":"\(currency)","totalCents":\(totalCents),\
            "subtotalCents":\(subtotalCents),"taxCents":\(taxCents),\
            "surchargeCents":\(surchargeCents),"shippingCents":\(shippingCents),\
            "discountCents":\(discountCents),"items":\(items),"documents":\(documents)}}
            """
    }

    internal static let oneItem = """
        [{"name":"Timber Pine DAR 42x19","quantity":null,"unitPriceCents":1250,\
        "lineTotalCents":1250,"notes":[]}]
        """

    internal static func gateFailure(
        code: String, detail: String = "off by a bit", deltaCents: String = "null"
    ) -> String {
        """
        {"code":"\(code)","detail":"\(detail)","deltaCents":\(deltaCents)}
        """
    }

    internal static func unreadable(
        reason: String = "the image is blank",
        receiptUris: String = "[\"pops://purchases/receipt/\(String(repeating: "a", count: 64))\"]"
    ) -> String {
        """
        {"kind":"unreadable","receiptUris":\(receiptUris),"reason":"\(reason)"}
        """
    }

    /// `saveReceiptDraft` and `createManualPurchase` both answer this shape.
    internal static func purchaseDetail(
        id: String = "purchase-1",
        merchantName: String? = "Bunnings Warehouse",
        totalCents: Int = 2750,
        currency: String = "AUD",
        orderedAt: String = "2026-08-01T14:32:00+10:00",
        itemCount: Int = 1
    ) -> String {
        let merchantField = merchantName.map { "\"\($0)\"" } ?? "null"
        let items = String(
            repeating: """
                {"id":"item","name":"item","quantity":1,"lineTotalCents":100},
                """, count: itemCount
        ).dropLast()
        return """
            {"id":"\(id)","merchantName":\(merchantField),"totalCents":\(totalCents),\
            "orderedOn":"2026-08-01","currency":"\(currency)","orderedAt":"\(orderedAt)",\
            "itemCount":\(itemCount),"status":"awaiting_settlement","receiptUri":null,\
            "subtotalCents":\(totalCents),"taxCents":0,"shippingCents":0,"discountCents":0,\
            "surchargeCents":0,"source":"receipt","items":[\(items)]}
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
        _ transport: StubTransport,
        now: @escaping @Sendable () -> Date = Date.init,
        timeZone: @escaping @Sendable () -> TimeZone = { .autoupdatingCurrent },
        captureLocation: @escaping @Sendable () -> CaptureLocation? = { nil }
    ) throws -> BFMReceiptCaptureRepository {
        BFMReceiptCaptureRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            ),
            now: now,
            timeZone: timeZone,
            captureLocation: captureLocation
        )
    }
}
