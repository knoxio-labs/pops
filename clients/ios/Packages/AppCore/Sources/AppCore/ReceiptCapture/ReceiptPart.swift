import Foundation

/// What the purchases pillar's drop-zone will read, mirroring its own closed
/// list (`MEDIA_TYPES` in `ingest/receipt/vision.ts`) — a phone photo, a PDF
/// invoice, or a pasted body.
public enum ReceiptMediaType: String, Hashable, Sendable {
    case jpeg = "image/jpeg"
    case png = "image/png"
    case webp = "image/webp"
    case gif = "image/gif"
    case pdf = "application/pdf"
    case plainText = "text/plain"
}

/// One frame of a receipt, as captured on the phone.
///
/// A full supermarket shop does not fit in one frame, so several photographs
/// of one piece of paper are one receipt and one call to
/// ``ReceiptCaptureRepository/capture(_:)`` — never several. Order matters:
/// top to bottom, the order the paper is read in.
public struct ReceiptPart: Hashable, Sendable {
    /// How many parts one receipt may be sent as.
    ///
    /// Mirrors the BFM's `MOBILE_RECEIPT_MAX_PARTS`
    /// (`pillars/bfm/src/contract/rest-schemas.ts`), which in turn mirrors the
    /// purchases pillar's own limit. Mirrored rather than discovered from a
    /// `400`, for the reason that contract states about itself: the cheaper
    /// refusal is the one that never leaves the handset — and a capture screen
    /// that knows the number can say what to do about a scan too long to send,
    /// where a rejected upload can only say it after the bytes were paid for.
    ///
    /// Duplicated across the wire, so it can drift. It drifts safely in one
    /// direction only: a smaller limit on the server refuses an upload this
    /// allows, which is a visible failure, while a larger one leaves capture
    /// stricter than it needs to be.
    public static let maxPerReceipt = 8

    public let mediaType: ReceiptMediaType
    public let data: Data

    public init(mediaType: ReceiptMediaType, data: Data) {
        self.mediaType = mediaType
        self.data = data
    }
}
