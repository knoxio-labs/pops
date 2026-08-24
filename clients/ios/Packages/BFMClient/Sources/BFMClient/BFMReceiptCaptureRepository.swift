import AppCore
import CoreLocation
import Foundation
import OpenAPIRuntime

/// Handing a photographed receipt to the purchases pillar through the BFM.
///
/// The screen behind this knows only ``ReceiptCaptureRepository``. What the
/// BFM's three-outcome contract looks like on the wire — which arm carries
/// what, and which of the producer's fields never reach a handset at all — is
/// decided here, once.
///
/// Carries no credential of its own, matching ``BFMTransactionsRepository``:
/// `POST /mobile/purchases/receipts` is a device-authenticated write, and the
/// client handed in is expected to already carry the middleware that attaches
/// one.
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

    /// Uploads one receipt's parts and reports which of the three outcomes
    /// the purchases pillar's gate produced.
    public func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome {
        let output: UploadReceipt.Output
        do {
            output = try await client.generated.mobilePurchases_uploadReceipt(
                body: .json(
                    .init(
                        capture: Self.capture(
                            now: now(), timeZone: timeZone(), location: captureLocation()),
                        parts: parts.map(Self.wire(from:))
                    )
                )
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: UploadReceipt.id)
        }

        return try outcome(from: output)
    }
}

extension BFMReceiptCaptureRepository {
    private static func capture(
        now: Date,
        timeZone: TimeZone,
        location: CaptureLocation?
    ) -> UploadReceiptCapture {
        UploadReceiptCapture(
            capturedAt: CaptureTimestampFormatter.string(from: now, in: timeZone),
            location: location.map { UploadReceiptCaptureLocation(latitude: $0.latitude, longitude: $0.longitude) },
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

    private func outcome(from output: UploadReceipt.Output) throws -> ReceiptOutcome {
        switch output {
        case .ok(let ok):
            return try Self.outcome(from: try ok.body.json)
        case .badRequest:
            throw RepositoryError.transport("\(UploadReceipt.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .contentTooLarge:
            // The device chose what it sent; a screen offering "retry" for a
            // fixed-size upload that will fail the same way again is not a
            // path forward, so this is a transport failure, not `unreadable`
            // — nothing about the receipt itself was read.
            throw RepositoryError.transport("\(UploadReceipt.id): payload too large")
        case .tooManyRequests:
            throw RepositoryError.transport("\(UploadReceipt.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: UploadReceipt.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: UploadReceipt.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(UploadReceipt.id): undocumented status \(statusCode)"
            )
        }
    }

    /// The wire's `oneOf` into ``ReceiptOutcome``.
    ///
    /// Neither review arm carries a photo reference, and that is deliberate on
    /// the BFM's side: the parts are addressed by `pops://` URIs into the
    /// purchases pillar's own store, and no mobile route serves those bytes,
    /// so the count is published instead of a pointer this app could only
    /// ignore.
    private static func outcome(from payload: UploadReceipt.Output.Ok.Body.JsonPayload) throws
        -> ReceiptOutcome
    {
        switch payload {
        case .case1(let created):
            return .created(
                purchase: purchase(from: created.purchase),
                alreadyStored: created.alreadyStored
            )
        case .case2(let needsReview):
            return .needsReview(
                receiptCount: needsReview.receiptCount,
                failures: needsReview.problems.map(failure(from:)),
                extracted: extracted(from: needsReview.extracted)
            )
        case .case3(let unreadable):
            return .unreadable(receiptCount: unreadable.receiptCount, reason: unreadable.reason)
        }
    }

    /// The wire's purchase into the one the confirmation screen draws.
    ///
    /// The cents and the currency code become a ``MoneyAmount`` here rather
    /// than on the screen, matching ``BFMTransactionsRepository``: how many
    /// minor units a currency has is one question, answered in one place.
    private static func purchase(from wire: CreatedPurchase) -> ReceiptPurchase {
        ReceiptPurchase(
            id: wire.id,
            merchantName: wire.merchantName,
            total: MoneyAmount(minorUnits: wire.totalCents, currencyCode: wire.currency),
            orderedAt: wire.orderedAt,
            itemCount: wire.itemCount
        )
    }

    /// One wire problem into ``ReceiptGateFailure``.
    ///
    /// A code this build has no copy for becomes
    /// ``AppCore/ReceiptGateFailureKind/unrecognised(_:)`` rather than sinking
    /// the outcome. The BFM keeps `code` open precisely so a gate that grows a
    /// reason does not break an installed build, and refusing the answer here
    /// would spend that guarantee on nothing — the producer's own `detail` is
    /// the sentence a reviewer reads either way.
    private static func failure(from wire: NeedsReviewProblem) -> ReceiptGateFailure {
        ReceiptGateFailure(
            kind: ReceiptGateFailureKind(wireCode: wire.code),
            detail: wire.detail,
            deltaCents: wire.deltaCents
        )
    }

    /// The reading, field for field. Nothing is parsed: every money value is
    /// the string the model transcribed off the paper, and turning one into a
    /// number here would be this app asserting a figure the producer's own
    /// gate has just refused to believe.
    private static func extracted(from wire: NeedsReviewExtracted) -> ExtractedReceipt {
        ExtractedReceipt(
            merchantName: wire.merchantName,
            address: wire.address,
            purchasedOn: wire.purchasedOn,
            purchasedAt: wire.purchasedAt,
            currency: wire.currency,
            total: wire.total,
            tax: wire.tax,
            discounts: wire.discounts,
            surcharges: wire.surcharges,
            shipping: wire.shipping,
            lines: wire.lines.map(line(from:)),
            unreadableNotes: wire.unreadableNotes
        )
    }

    private static func line(from wire: NeedsReviewExtractedLine) -> ExtractedReceiptLine {
        ExtractedReceiptLine(
            description: wire.description,
            amount: wire.amount,
            quantity: wire.quantity,
            unitNote: wire.unitNote
        )
    }

    /// One ``ReceiptPart`` into the wire's shape. `Data` becomes base64
    /// because that is what the contract's `dataBase64` field is — the
    /// generator carries no `Foundation.Data` binding for a plain JSON
    /// string.
    private static func wire(from part: ReceiptPart) -> UploadReceiptPart {
        UploadReceiptPart(
            dataBase64: part.data.base64EncodedString(),
            mediaType: mediaType(from: part.mediaType)
        )
    }

    private static func mediaType(from mediaType: ReceiptMediaType) -> UploadReceiptMediaType {
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
private typealias UploadReceipt = Operations.MobilePurchases_uploadReceipt
private typealias UploadReceiptPart =
    UploadReceipt.Input.Body.JsonPayload.PartsPayloadPayload
private typealias UploadReceiptCapture =
    UploadReceipt.Input.Body.JsonPayload.CapturePayload
private typealias UploadReceiptCaptureLocation =
    UploadReceipt.Input.Body.JsonPayload.CapturePayload.LocationPayload
private typealias UploadReceiptMediaType =
    UploadReceipt.Input.Body.JsonPayload.PartsPayloadPayload.MediaTypePayload
private typealias CreatedPurchase =
    UploadReceipt.Output.Ok.Body.JsonPayload.Case1Payload.PurchasePayload
private typealias NeedsReviewProblem =
    UploadReceipt.Output.Ok.Body.JsonPayload.Case2Payload.ProblemsPayloadPayload
private typealias NeedsReviewExtracted =
    UploadReceipt.Output.Ok.Body.JsonPayload.Case2Payload.ExtractedPayload
private typealias NeedsReviewExtractedLine =
    UploadReceipt.Output.Ok.Body.JsonPayload.Case2Payload.ExtractedPayload.LinesPayloadPayload

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
