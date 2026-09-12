import AppCore
import CoreLocation
import Foundation
import OpenAPIRuntime

// Turning what the BFM answered into what a screen can draw.
//
// The counterpart of BFMReceiptCaptureRequests.swift; see that file's header.

// MARK: - response mapping

extension BFMReceiptCaptureRepository {
    fileprivate static func purchase(from wire: some PurchaseDetailPayload) -> ReceiptPurchase {
        ReceiptPurchase(
            id: wire.id,
            merchantName: wire.merchantName,
            total: MoneyAmount(minorUnits: wire.totalCents, currencyCode: wire.currency),
            orderedAt: wire.orderedAt,
            itemCount: wire.itemCount
        )
    }

    static func failure(from wire: ExtractReceiptFailure) -> ReceiptGateFailure {
        ReceiptGateFailure(
            kind: ReceiptGateFailureKind(wireCode: wire.code),
            detail: wire.detail,
            deltaCents: wire.deltaCents
        )
    }

    /// The BFM's cents-and-facts draft, back into ``ExtractedReceipt``'s
    /// printed-looking shape — the one ``ReceiptDraftPresentation`` already
    /// knows how to turn into a ``ReceiptDraft``. Formatting cents as a
    /// plain decimal string here, once, is what lets that presentation code
    /// stay unaware this draft was ever a number.
    static func extracted(from wire: ExtractReceiptDraftWire) -> ExtractedReceipt {
        let (purchasedOn, purchasedAt) = ReceiptOrderedAt.splitting(wire.orderedAt)
        return ExtractedReceipt(
            merchantName: wire.merchantName,
            address: nil,
            purchasedOn: purchasedOn,
            purchasedAt: purchasedAt,
            currency: wire.currency,
            total: ReceiptMoneyText.string(fromCents: wire.totalCents),
            tax: wire.taxCents == 0 ? nil : ReceiptMoneyText.string(fromCents: wire.taxCents),
            discounts: wire.discountCents == 0
                ? [] : [ReceiptMoneyText.string(fromCents: wire.discountCents)],
            surcharges: wire.surchargeCents == 0
                ? [] : [ReceiptMoneyText.string(fromCents: wire.surchargeCents)],
            shipping: wire.shippingCents == 0
                ? nil : ReceiptMoneyText.string(fromCents: wire.shippingCents),
            lines: wire.items.map(line(from:)),
            unreadableNotes: []
        )
    }

    static func line(from wire: ExtractReceiptDraftItem) -> ExtractedReceiptLine {
        ExtractedReceiptLine(
            description: wire.name,
            amount: ReceiptMoneyText.string(fromCents: wire.lineTotalCents),
            quantity: wire.quantity,
            unitNote: nil
        )
    }

    static func capture(from wire: ExtractReceiptDraftCaptureWire?) -> ReceiptCaptureFacts? {
        guard let wire else { return nil }
        return ReceiptCaptureFacts(
            capturedAt: wire.capturedAt,
            capturedAtSource: wire.capturedAtSource?.rawValue,
            utcOffsetMinutes: wire.utcOffsetMinutes,
            declaredTimeZone: wire.declaredTimeZone,
            latitude: wire.latitude,
            longitude: wire.longitude,
            locationSource: wire.locationSource?.rawValue
        )
    }

    /// One ``ReceiptPart`` into the wire's shape. `Data` becomes base64
    /// because that is what the contract's `dataBase64` field is — the
    /// generator carries no `Foundation.Data` binding for a plain JSON
    /// string.
    static func wire(from part: ReceiptPart) -> ExtractReceiptPart {
        ExtractReceiptPart(
            dataBase64: part.data.base64EncodedString(),
            mediaType: mediaType(from: part.mediaType)
        )
    }

    static func mediaType(from mediaType: ReceiptMediaType) -> ExtractReceiptMediaType {
        switch mediaType {
        case .jpeg: .imageJpeg
        case .png: .imagePng
        case .webp: .imageWebp
        case .gif: .imageGif
        case .pdf: .applicationPdf
        case .plainText: .textPlain
        }
    }
}

/// The generated names, shortened. Written out in full they pass 120 columns
/// in every signature above, and the type they abbreviate is `internal` to
/// this module — nothing here widens what a caller can name.
internal typealias ExtractReceipt = Operations.MobilePurchases_extractReceipt
internal typealias ExtractReceiptPart =
    ExtractReceipt.Input.Body.JsonPayload.PartsPayloadPayload
internal typealias ExtractReceiptCapture =
    ExtractReceipt.Input.Body.JsonPayload.CapturePayload
internal typealias ExtractReceiptCaptureLocation =
    ExtractReceipt.Input.Body.JsonPayload.CapturePayload.LocationPayload
internal typealias ExtractReceiptMediaType =
    ExtractReceipt.Input.Body.JsonPayload.PartsPayloadPayload.MediaTypePayload
internal typealias ExtractReceiptDraftWire =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.DraftPayload
internal typealias ExtractReceiptDraftItem =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.DraftPayload.ItemsPayloadPayload
internal typealias ExtractReceiptDraftCaptureWire =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.DraftPayload.CapturePayload
internal typealias ExtractReceiptFailure =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.FailuresPayloadPayload

internal typealias SaveReceiptDraft = Operations.MobilePurchases_saveReceiptDraft
internal typealias SaveReceiptDraftItem =
    SaveReceiptDraft.Input.Body.JsonPayload.ItemsPayloadPayload
internal typealias SaveReceiptDraftDocument =
    SaveReceiptDraft.Input.Body.JsonPayload.DocumentsPayloadPayload
internal typealias SaveReceiptDraftCapture =
    SaveReceiptDraft.Input.Body.JsonPayload.CapturePayload

internal typealias CreateManualPurchase = Operations.MobilePurchases_createManualPurchase
internal typealias CreateManualPurchaseItem =
    CreateManualPurchase.Input.Body.JsonPayload.ItemsPayloadPayload

internal struct CaptureLocation: Sendable {
    internal let latitude: Double
    internal let longitude: Double
}

internal enum CaptureTimestampFormatter {
    static let formatOptions: ISO8601DateFormatter.Options = [
        .withInternetDateTime,
        .withFractionalSeconds,
        .withColonSeparatorInTimeZone,
    ]

    static func string(from date: Date, in timeZone: TimeZone) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = formatOptions
        formatter.timeZone = timeZone
        return formatter.string(from: date)
    }
}

/// Splitting a resolved `orderedAt` instant back into the printed-looking
/// `YYYY-MM-DD` / `HH:MM` pair ``ExtractedReceipt`` carries, in the offset
/// the instant itself states — reconstructing what the paper would have
/// shown, from the instant `purchases` already resolved it to.
private enum ReceiptOrderedAt {
    static func splitting(_ orderedAt: String) -> (purchasedOn: String?, purchasedAt: String?) {
        guard
            let date = ISO8601DateFormatter.withFractionalSeconds().date(from: orderedAt)
                ?? ISO8601DateFormatter.withoutFractionalSeconds().date(from: orderedAt)
        else {
            return (nil, nil)
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Self.timeZone(from: orderedAt)
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        guard let year = components.year, let month = components.month, let day = components.day,
            let hour = components.hour, let minute = components.minute
        else {
            return (nil, nil)
        }
        let purchasedOn = String(format: "%04d-%02d-%02d", year, month, day)
        let purchasedAt = String(format: "%02d:%02d", hour, minute)
        return (purchasedOn, purchasedAt)
    }

    /// UTC, for a timestamp stating no offset this can read.
    ///
    /// `TimeZone.gmt` rather than `TimeZone(identifier: "UTC")!`: the force
    /// unwrap was safe in practice and unnecessary in principle.
    static let utc = TimeZone.gmt

    static func timeZone(from orderedAt: String) -> TimeZone {
        guard
            let offsetRange = orderedAt.range(
                of: #"[+-]\d{2}:\d{2}$"#, options: .regularExpression)
        else {
            return utc
        }
        let offset = orderedAt[offsetRange]
        let sign = offset.hasPrefix("-") ? -1 : 1
        let parts = offset.dropFirst().split(separator: ":")
        guard parts.count == 2, let hours = Int(parts[0]), let minutes = Int(parts[1]) else {
            return utc
        }
        return TimeZone(secondsFromGMT: sign * (hours * 3600 + minutes * 60)) ?? utc
    }
}

extension ISO8601DateFormatter {
    fileprivate static func withFractionalSeconds() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    fileprivate static func withoutFractionalSeconds() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }
}

/// A save/manual response, common enough between the two generated `Output`
/// types to share one mapper.
///
/// Internal rather than private: the repository that calls it lives in a
/// sibling file, and Swift's `private` does not reach across one.
internal protocol WriteOutput {
    func asPurchase(operation: String) throws -> ReceiptPurchase
}

extension Operations.MobilePurchases_saveReceiptDraft.Output: WriteOutput {
    func asPurchase(operation: String) throws -> ReceiptPurchase {
        switch self {
        case .ok(let ok):
            return BFMReceiptCaptureRepository.purchase(from: try ok.body.json)
        case .badRequest:
            throw RepositoryError.transport("\(operation): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(operation): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: operation)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: operation)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport("\(operation): undocumented status \(statusCode)")
        }
    }
}

extension Operations.MobilePurchases_createManualPurchase.Output: WriteOutput {
    func asPurchase(operation: String) throws -> ReceiptPurchase {
        switch self {
        case .ok(let ok):
            return BFMReceiptCaptureRepository.purchase(from: try ok.body.json)
        case .badRequest:
            throw RepositoryError.transport("\(operation): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(operation): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: operation)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: operation)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport("\(operation): undocumented status \(statusCode)")
        }
    }
}
