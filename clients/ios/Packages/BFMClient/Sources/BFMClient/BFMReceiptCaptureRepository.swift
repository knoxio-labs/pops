import AppCore
import CoreLocation
import Foundation
import OpenAPIRuntime

/// Reading a photographed receipt into an editable draft, saving one, and
/// creating a purchase with no receipt at all — all through the BFM
/// (POPS-2454).
///
/// The screen behind this knows only ``ReceiptCaptureRepository``. What the
/// BFM's contract looks like on the wire — which arm carries what, and which
/// of the producer's fields never reach a handset at all — is decided here,
/// once.
///
/// Carries no credential of its own, matching ``BFMTransactionsRepository``:
/// every route here is a device-authenticated call, and the client handed in
/// is expected to already carry the middleware that attaches one.
public struct BFMReceiptCaptureRepository: ReceiptCaptureRepository {
    private let client: BFMHTTPClient
    private let now: @Sendable () -> Date
    private let timeZone: @Sendable () -> TimeZone
    private let captureLocation: @Sendable () -> CaptureLocation?

    /// - Parameter client: Already carrying whatever authenticates a
    ///   `/mobile/*` call.
    public init(client: BFMHTTPClient) {
        self.init(
            client: client,
            now: Date.init,
            timeZone: { .autoupdatingCurrent },
            captureLocation: Self.currentLocation
        )
    }

    internal init(
        client: BFMHTTPClient,
        now: @escaping @Sendable () -> Date,
        timeZone: @escaping @Sendable () -> TimeZone,
        captureLocation: @escaping @Sendable () -> CaptureLocation?
    ) {
        self.client = client
        self.now = now
        self.timeZone = timeZone
        self.captureLocation = captureLocation
    }

    /// Reads one receipt's parts into an editable draft. Persists nothing.
    public func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        let output: ExtractReceipt.Output
        do {
            output = try await client.generated.mobilePurchases_extractReceipt(
                body: .json(
                    .init(
                        capture: Self.capture(
                            now: now(), timeZone: timeZone(), location: captureLocation()),
                        parts: parts.map(Self.wire(from:))
                    )
                )
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: ExtractReceipt.id)
        }

        return try extraction(from: output)
    }

    public func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
        let output: SaveReceiptDraft.Output
        do {
            output = try await client.generated.mobilePurchases_saveReceiptDraft(
                body: .json(Self.saveDraftBody(from: payload))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: SaveReceiptDraft.id)
        }
        return try purchase(from: output, operation: SaveReceiptDraft.id)
    }

    public func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
    {
        let output: CreateManualPurchase.Output
        do {
            output = try await client.generated.mobilePurchases_createManualPurchase(
                body: .json(Self.manualBody(from: payload))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: CreateManualPurchase.id)
        }
        return try purchase(from: output, operation: CreateManualPurchase.id)
    }
}

extension BFMReceiptCaptureRepository {
    private static func capture(
        now: Date,
        timeZone: TimeZone,
        location: CaptureLocation?
    ) -> ExtractReceiptCapture {
        ExtractReceiptCapture(
            capturedAt: CaptureTimestampFormatter.string(from: now, in: timeZone),
            location: location.map {
                ExtractReceiptCaptureLocation(latitude: $0.latitude, longitude: $0.longitude)
            },
            timeZone: timeZone.identifier
        )
    }

    private static func currentLocation() -> CaptureLocation? {
        #if os(iOS)
            let locationManager = CLLocationManager()
            let authorization = locationManager.authorizationStatus
            guard authorization == .authorizedAlways || authorization == .authorizedWhenInUse,
                let location = locationManager.location
            else {
                return nil
            }

            return CaptureLocation(
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude
            )
        #else
            nil
        #endif
    }

    private func extraction(from output: ExtractReceipt.Output) throws -> ReceiptExtraction {
        switch output {
        case .ok(let ok):
            return try Self.extraction(from: try ok.body.json)
        case .badRequest:
            throw RepositoryError.transport("\(ExtractReceipt.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .contentTooLarge:
            throw RepositoryError.transport("\(ExtractReceipt.id): payload too large")
        case .tooManyRequests:
            throw RepositoryError.transport("\(ExtractReceipt.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: ExtractReceipt.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: ExtractReceipt.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(ExtractReceipt.id): undocumented status \(statusCode)"
            )
        }
    }

    private static func extraction(
        from payload: ExtractReceipt.Output.Ok.Body.JsonPayload
    ) throws -> ReceiptExtraction {
        switch payload {
        case .case1(let draft):
            return .draft(
                ReceiptDraftReading(
                    receiptUris: draft.receiptUris,
                    reconciled: draft.reconciled,
                    failures: draft.failures.map(failure(from:)),
                    extracted: extracted(from: draft.draft),
                    capture: capture(from: draft.draft.capture)
                )
            )
        case .case2(let unreadable):
            return .unreadable(
                receiptCount: unreadable.receiptUris.count, reason: unreadable.reason)
        }
    }

    /// One save/manual result, common to both write calls.
    private func purchase<Output>(
        from output: Output, operation: String
    ) throws -> ReceiptPurchase where Output: WriteOutput {
        try output.asPurchase(operation: operation)
    }
}

/// The fields `saveReceiptDraft` and `createManualPurchase` answer with, in
/// common — two distinct generated types with the same shape, unified so one
/// mapper serves both.
private protocol PurchaseDetailPayload {
    var id: String { get }
    var merchantName: String? { get }
    var totalCents: Int { get }
    var currency: String { get }
    var orderedAt: String { get }
    var itemCount: Int { get }
}

extension Operations.MobilePurchases_saveReceiptDraft.Output.Ok.Body.JsonPayload:
    PurchaseDetailPayload
{}

extension Operations.MobilePurchases_createManualPurchase.Output.Ok.Body.JsonPayload:
    PurchaseDetailPayload
{}

// MARK: - request mapping

extension BFMReceiptCaptureRepository {
    private static func saveDraftBody(
        from payload: ReceiptDraftSavePayload
    ) -> SaveReceiptDraft.Input.Body.JsonPayload {
        SaveReceiptDraft.Input.Body.JsonPayload(
            capture: captureWire(payload.fields.capture),
            currency: payload.fields.currency,
            discountCents: payload.fields.discountCents,
            documents: payload.documents.map {
                SaveReceiptDraftDocument(documentUri: $0.documentUri, kind: .receipt)
            },
            idempotencyKey: payload.fields.idempotencyKey,
            items: payload.fields.items.map(saveDraftItem(from:)),
            merchantName: payload.fields.merchantName,
            orderedAt: payload.fields.orderedAt,
            shippingCents: payload.fields.shippingCents,
            surchargeCents: payload.fields.surchargeCents,
            taxCents: payload.fields.taxCents,
            totalCents: payload.fields.totalCents
        )
    }

    private static func manualBody(
        from payload: ReceiptManualPurchasePayload
    ) -> CreateManualPurchase.Input.Body.JsonPayload {
        CreateManualPurchase.Input.Body.JsonPayload(
            capture: manualCaptureWire(payload.fields.capture),
            currency: payload.fields.currency,
            discountCents: payload.fields.discountCents,
            idempotencyKey: payload.fields.idempotencyKey,
            items: payload.fields.items.map(manualItem(from:)),
            merchantName: payload.fields.merchantName,
            orderedAt: payload.fields.orderedAt,
            shippingCents: payload.fields.shippingCents,
            surchargeCents: payload.fields.surchargeCents,
            taxCents: payload.fields.taxCents,
            totalCents: payload.fields.totalCents
        )
    }

    private static func saveDraftItem(from line: ReceiptSaveLine) -> SaveReceiptDraftItem {
        SaveReceiptDraftItem(
            lineTotalCents: line.lineTotalCents,
            name: line.name,
            notes: line.notes,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents
        )
    }

    private static func manualItem(from line: ReceiptSaveLine) -> CreateManualPurchaseItem {
        CreateManualPurchaseItem(
            lineTotalCents: line.lineTotalCents,
            name: line.name,
            notes: line.notes,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents
        )
    }

    private static func captureWire(_ facts: ReceiptCaptureFacts?) -> SaveReceiptDraftCapture? {
        guard let facts else { return nil }
        return SaveReceiptDraftCapture(
            capturedAt: facts.capturedAt,
            capturedAtSource: SaveReceiptDraftCapture.CapturedAtSourcePayload(
                rawValue: facts.capturedAtSource ?? ""),
            declaredTimeZone: facts.declaredTimeZone,
            latitude: facts.latitude,
            locationSource: SaveReceiptDraftCapture.LocationSourcePayload(
                rawValue: facts.locationSource ?? ""),
            longitude: facts.longitude,
            utcOffsetMinutes: facts.utcOffsetMinutes
        )
    }

    private static func manualCaptureWire(_ facts: ReceiptCaptureFacts?)
        -> CreateManualPurchase.Input.Body.JsonPayload.CapturePayload?
    {
        guard let facts else { return nil }
        return CreateManualPurchase.Input.Body.JsonPayload.CapturePayload(
            capturedAt: facts.capturedAt,
            capturedAtSource: CreateManualPurchase.Input.Body.JsonPayload.CapturePayload
                .CapturedAtSourcePayload(rawValue: facts.capturedAtSource ?? ""),
            declaredTimeZone: facts.declaredTimeZone,
            latitude: facts.latitude,
            locationSource: CreateManualPurchase.Input.Body.JsonPayload.CapturePayload
                .LocationSourcePayload(rawValue: facts.locationSource ?? ""),
            longitude: facts.longitude,
            utcOffsetMinutes: facts.utcOffsetMinutes
        )
    }
}

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

    private static func failure(from wire: ExtractReceiptFailure) -> ReceiptGateFailure {
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
    private static func extracted(from wire: ExtractReceiptDraftWire) -> ExtractedReceipt {
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

    private static func line(from wire: ExtractReceiptDraftItem) -> ExtractedReceiptLine {
        ExtractedReceiptLine(
            description: wire.name,
            amount: ReceiptMoneyText.string(fromCents: wire.lineTotalCents),
            quantity: wire.quantity,
            unitNote: nil
        )
    }

    private static func capture(from wire: ExtractReceiptDraftCaptureWire?) -> ReceiptCaptureFacts?
    {
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
    private static func wire(from part: ReceiptPart) -> ExtractReceiptPart {
        ExtractReceiptPart(
            dataBase64: part.data.base64EncodedString(),
            mediaType: mediaType(from: part.mediaType)
        )
    }

    private static func mediaType(from mediaType: ReceiptMediaType) -> ExtractReceiptMediaType {
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
private typealias ExtractReceipt = Operations.MobilePurchases_extractReceipt
private typealias ExtractReceiptPart =
    ExtractReceipt.Input.Body.JsonPayload.PartsPayloadPayload
private typealias ExtractReceiptCapture =
    ExtractReceipt.Input.Body.JsonPayload.CapturePayload
private typealias ExtractReceiptCaptureLocation =
    ExtractReceipt.Input.Body.JsonPayload.CapturePayload.LocationPayload
private typealias ExtractReceiptMediaType =
    ExtractReceipt.Input.Body.JsonPayload.PartsPayloadPayload.MediaTypePayload
private typealias ExtractReceiptDraftWire =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.DraftPayload
private typealias ExtractReceiptDraftItem =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.DraftPayload.ItemsPayloadPayload
private typealias ExtractReceiptDraftCaptureWire =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.DraftPayload.CapturePayload
private typealias ExtractReceiptFailure =
    ExtractReceipt.Output.Ok.Body.JsonPayload.Case1Payload.FailuresPayloadPayload

private typealias SaveReceiptDraft = Operations.MobilePurchases_saveReceiptDraft
private typealias SaveReceiptDraftItem =
    SaveReceiptDraft.Input.Body.JsonPayload.ItemsPayloadPayload
private typealias SaveReceiptDraftDocument =
    SaveReceiptDraft.Input.Body.JsonPayload.DocumentsPayloadPayload
private typealias SaveReceiptDraftCapture =
    SaveReceiptDraft.Input.Body.JsonPayload.CapturePayload

private typealias CreateManualPurchase = Operations.MobilePurchases_createManualPurchase
private typealias CreateManualPurchaseItem =
    CreateManualPurchase.Input.Body.JsonPayload.ItemsPayloadPayload

internal struct CaptureLocation: Sendable {
    internal let latitude: Double
    internal let longitude: Double
}

private enum CaptureTimestampFormatter {
    private static let formatOptions: ISO8601DateFormatter.Options = [
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
        guard let date = ISO8601DateFormatter.withFractionalSeconds().date(from: orderedAt)
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

    private static func timeZone(from orderedAt: String) -> TimeZone {
        guard let offsetRange = orderedAt.range(
            of: #"[+-]\d{2}:\d{2}$"#, options: .regularExpression)
        else {
            return TimeZone(identifier: "UTC")!
        }
        let offset = orderedAt[offsetRange]
        let sign = offset.hasPrefix("-") ? -1 : 1
        let parts = offset.dropFirst().split(separator: ":")
        guard parts.count == 2, let hours = Int(parts[0]), let minutes = Int(parts[1]) else {
            return TimeZone(identifier: "UTC")!
        }
        return TimeZone(secondsFromGMT: sign * (hours * 3600 + minutes * 60)) ?? TimeZone(
            identifier: "UTC")!
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
private protocol WriteOutput {
    func asPurchase(operation: String) throws -> ReceiptPurchase
}

extension Operations.MobilePurchases_saveReceiptDraft.Output: WriteOutput {
    fileprivate func asPurchase(operation: String) throws -> ReceiptPurchase {
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
    fileprivate func asPurchase(operation: String) throws -> ReceiptPurchase {
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
