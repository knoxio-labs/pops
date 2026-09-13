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
/// Internal rather than private: the response mapping that consumes it lives
/// in a sibling file, and Swift's `private` does not reach across one.
internal protocol PurchaseDetailPayload {
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
