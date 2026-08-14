import AppCore
import Foundation
import OpenAPIRuntime

/// Handing a photographed receipt to the purchases pillar through the BFM.
///
/// The screen behind this knows only ``ReceiptCaptureRepository``. What the
/// BFM's three-outcome contract looks like on the wire, and what it means
/// that `needs-review` and `unreadable` carry far less than
/// ``ExtractedReceipt`` can hold, are decided here, once.
///
/// Carries no credential of its own, matching ``BFMTransactionsRepository``:
/// `POST /mobile/purchases/receipts` is a device-authenticated write, and the
/// client handed in is expected to already carry the middleware that attaches
/// one.
public struct BFMReceiptCaptureRepository: ReceiptCaptureRepository {
    private let client: BFMHTTPClient

    /// - Parameter client: Already carrying whatever authenticates a
    ///   `/mobile/*` call.
    public init(client: BFMHTTPClient) {
        self.client = client
    }

    /// Uploads one receipt's parts and reports which of the three outcomes
    /// the purchases pillar's gate produced.
    public func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome {
        let output: UploadReceipt.Output
        do {
            output = try await client.generated.mobilePurchases_uploadReceipt(
                body: .json(.init(parts: parts.map(Self.wire(from:))))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: UploadReceipt.id)
        }

        return try outcome(from: output)
    }
}

extension BFMReceiptCaptureRepository {
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
    /// `needs-review` and `unreadable` do not carry a photo reference on the
    /// wire — `MobileReceiptOutcomeSchema` in the BFM's own contract states
    /// that deliberately, to keep a payload the phone cannot act on off
    /// cellular. ``ReceiptOutcome`` still declares `receiptURIs` on both, so
    /// this reports none rather than inventing one; the result screen already
    /// treats an empty list as "say nothing about the photo count" rather
    /// than as a missing value.
    private static func outcome(from payload: UploadReceipt.Output.Ok.Body.JsonPayload) throws
        -> ReceiptOutcome
    {
        switch payload {
        case .case1(let created):
            return .created(purchaseId: created.purchase.id, alreadyStored: created.alreadyStored)
        case .case2(let needsReview):
            return .needsReview(
                receiptURIs: [],
                failures: try needsReview.problems.map(failure(from:)),
                extracted: .empty
            )
        case .case3(let unreadable):
            return .unreadable(receiptURIs: [], reason: unreadable.reason)
        }
    }

    /// One wire problem into ``ReceiptGateFailure``.
    ///
    /// The BFM's own contract keeps `code` an open string on purpose — a gate
    /// that grows a seventh reason must not fail every needs-review upload to
    /// decode on a handset that has not been updated — but
    /// ``ReceiptGateFailureKind`` is the closed set the result screen already
    /// has copy for. A code outside it fails the whole outcome rather than
    /// being rendered as a label nobody wrote, the same call
    /// ``BFMTransactionsRepository`` makes about a row it cannot represent.
    ///
    /// `deltaCents` has nothing to read from: `MobileReceiptProblemSchema`
    /// carries only `code` and `detail`.
    private static func failure(from wire: NeedsReviewProblem) throws -> ReceiptGateFailure {
        guard let kind = ReceiptGateFailureKind(rawValue: wire.code) else {
            throw RepositoryError.contractMismatch
        }
        return ReceiptGateFailure(kind: kind, detail: wire.detail, deltaCents: nil)
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

extension ExtractedReceipt {
    /// Every field absent. What a `needs-review` outcome maps to today: the
    /// BFM's mobile contract does not send an extracted reading, so there is
    /// nothing to fill this with. ``ReceiptResultPresentation`` drops a field
    /// with nothing to show rather than rendering a dash, so this renders as
    /// no extracted-fields section at all rather than one padded with blanks.
    fileprivate static let empty = ExtractedReceipt(
        merchantName: nil,
        address: nil,
        timeZone: nil,
        purchasedOn: nil,
        purchasedAt: nil,
        currency: nil,
        total: "",
        tax: nil,
        discounts: [],
        surcharges: [],
        shipping: nil,
        lines: [],
        unreadableNotes: []
    )
}

/// The generated names, shortened. Written out in full they pass 120 columns
/// in every signature above, and the type they abbreviate is `internal` to
/// this module — nothing here widens what a caller can name.
private typealias UploadReceipt = Operations.MobilePurchases_uploadReceipt
private typealias UploadReceiptPart =
    UploadReceipt.Input.Body.JsonPayload.PartsPayloadPayload
private typealias UploadReceiptMediaType =
    UploadReceipt.Input.Body.JsonPayload.PartsPayloadPayload.MediaTypePayload
private typealias NeedsReviewProblem =
    UploadReceipt.Output.Ok.Body.JsonPayload.Case2Payload.ProblemsPayloadPayload
